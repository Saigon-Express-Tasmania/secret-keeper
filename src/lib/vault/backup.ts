import type { StorageStrategy } from "@/lib/storage/types"

const DEFAULT_PREFIX = "bak-"
const DEFAULT_INTERVAL_HOURS = 8
const DEFAULT_RETENTION_DAYS = 7
const VERIFY_ATTEMPTS = 3
const TIMESTAMP_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/
const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

export type BackupConfig = {
  prefix: string
  intervalHours: number
  retentionDays: number
}

export function formatBackupTimestamp(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, "0")
  const mo = (date.getUTCMonth() + 1).toString().padStart(2, "0")
  const d = date.getUTCDate().toString().padStart(2, "0")
  const h = date.getUTCHours().toString().padStart(2, "0")
  const mi = date.getUTCMinutes().toString().padStart(2, "0")
  const s = date.getUTCSeconds().toString().padStart(2, "0")
  return `${y}${mo}${d}T${h}${mi}${s}Z`
}

export function backupObjectKey(
  prefix: string,
  objectKey: string,
  date: Date
): string {
  return `${prefix}${objectKey}-${formatBackupTimestamp(date)}`
}

/** Parse a trailing `-yyyyMMddTHHmmssZ` timestamp from a prefixed backup key. */
export function parseBackupTimestamp(
  key: string,
  prefix: string
): Date | null {
  if (!prefix || !key.startsWith(prefix)) {
    return null
  }
  const rest = key.slice(prefix.length)
  const match = rest.match(/-(\d{8}T\d{6}Z)$/)
  if (!match) {
    return null
  }
  const stamp = match[1]
  const parts = TIMESTAMP_PATTERN.exec(stamp)
  if (!parts) {
    return null
  }
  const date = new Date(
    Date.UTC(
      Number(parts[1]),
      Number(parts[2]) - 1,
      Number(parts[3]),
      Number(parts[4]),
      Number(parts[5]),
      Number(parts[6])
    )
  )
  if (Number.isNaN(date.getTime())) {
    return null
  }
  if (formatBackupTimestamp(date) !== stamp) {
    return null
  }
  return date
}

function parseNonNegativeNumber(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }
  return parsed
}

export function getBackupConfig(): BackupConfig {
  const prefix = import.meta.env.VITE_VAULT_BACKUP_PREFIX || DEFAULT_PREFIX
  const intervalHours = parseNonNegativeNumber(
    import.meta.env.VITE_VAULT_BACKUP_INTERVAL_HOURS,
    DEFAULT_INTERVAL_HOURS
  )
  const retentionDays = parseNonNegativeNumber(
    import.meta.env.VITE_VAULT_BACKUP_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS
  )
  return {
    prefix,
    intervalHours,
    retentionDays: retentionDays > 0 ? retentionDays : DEFAULT_RETENTION_DAYS,
  }
}

function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", asBufferSource(data))
  const bytes = new Uint8Array(digest)
  let hex = ""
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0")
  }
  return hex
}

/**
 * Upload, re-download, and compare SHA-256. Deletes a failed object and retries.
 * Only returns after the remote copy matches the snapshot.
 */
async function uploadVerifiedBackup(
  storage: StorageStrategy,
  backupKey: string,
  blob: Uint8Array,
  expectedHash: string
): Promise<void> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
    try {
      await storage.upload(backupKey, blob)
      const remote = await storage.download(backupKey)
      if (!remote) {
        throw new Error("Backup object missing after upload.")
      }
      if (remote.byteLength !== blob.byteLength) {
        throw new Error(
          `Backup size mismatch: expected ${blob.byteLength} bytes, got ${remote.byteLength}.`
        )
      }
      const actualHash = await sha256Hex(remote)
      if (actualHash !== expectedHash) {
        throw new Error("Backup SHA-256 mismatch after download.")
      }
      return
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      await storage.remove(backupKey).catch(() => {
        /* keep lastError from the verify failure */
      })
    }
  }

  throw lastError ?? new Error("Vault backup failed integrity check.")
}

async function pruneExpiredBackups(
  storage: StorageStrategy,
  dated: { key: string; timestamp: Date }[],
  cutoff: number
): Promise<void> {
  for (const entry of dated) {
    if (entry.timestamp.getTime() < cutoff) {
      await storage.remove(entry.key)
    }
  }
}

/**
 * Copy the live vault ciphertext to a timestamped backup key when due,
 * then delete backups older than the retention window.
 * A new backup is kept only after a verified re-download.
 * List/prune uses `{prefix}{objectKey}-` so due/retention is per vault.
 */
export async function maybeBackupRemoteVault(
  storage: StorageStrategy,
  blob: Uint8Array,
  objectKey: string
): Promise<void> {
  const config = getBackupConfig()
  if (config.intervalHours <= 0 || !config.prefix) {
    return
  }

  const listPrefix = `${config.prefix}${objectKey}-`
  const keys = await storage.list(listPrefix)
  const dated = keys
    .map((key) => {
      const timestamp = parseBackupTimestamp(key, config.prefix)
      return timestamp ? { key, timestamp } : null
    })
    .filter((entry): entry is { key: string; timestamp: Date } => entry !== null)

  const now = Date.now()
  const newest = dated.reduce<number>(
    (max, entry) => Math.max(max, entry.timestamp.getTime()),
    0
  )
  const intervalMs = config.intervalHours * MS_PER_HOUR
  const due = newest === 0 || now - newest >= intervalMs
  const cutoff = now - config.retentionDays * MS_PER_DAY

  if (due) {
    const backupKey = backupObjectKey(config.prefix, objectKey, new Date(now))
    const expectedHash = await sha256Hex(blob)
    await uploadVerifiedBackup(storage, backupKey, blob, expectedHash)
  }

  await pruneExpiredBackups(storage, dated, cutoff)
}

/**
 * Snapshot the ciphertext, then run backup after the current turn so unlock
 * and navigation are not blocked. Never rejects.
 */
export function scheduleVaultBackup(
  storage: StorageStrategy,
  blob: Uint8Array,
  objectKey: string
): void {
  const snapshot = blob.slice()
  globalThis.setTimeout(() => {
    void maybeBackupRemoteVault(storage, snapshot, objectKey).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.warn("Vault backup skipped:", message)
    })
  }, 0)
}
