/**
 * Server-side backups: before an overwrite (when due, and always before a
 * re-key) the current vault object is copied to backups/{name}/{ts}.enc.
 * CopyObject keeps the metadata, so a backup restored by copying it back
 * over vaults/{name}.enc comes with its matching auth record.
 */

import { backupPrefix, vaultObjectKey } from "../src/shared/vaultName"
import type { ObjectStore } from "./store"

const STAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.enc$/
export const KEEP_NEWEST_BACKUPS = 3
const DAY_SECONDS = 24 * 60 * 60

export function formatBackupTimestamp(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0")
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

export function backupObjectKey(name: string, date: Date): string {
  return `${backupPrefix(name)}${formatBackupTimestamp(date)}.enc`
}

/** Timestamp (ms) encoded in a backup key, or null for foreign keys. */
export function parseBackupKey(name: string, key: string): number | null {
  const prefix = backupPrefix(name)
  if (!key.startsWith(prefix)) return null
  const match = STAMP.exec(key.slice(prefix.length))
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match.map(Number) as number[]
  const ms = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!)
  return formatBackupTimestamp(new Date(ms)) + ".enc" === key.slice(prefix.length)
    ? ms
    : null
}

export function backupDue(
  lastBackupSeconds: number,
  nowSeconds: number,
  intervalHours: number,
  force: boolean
): boolean {
  if (force) return true
  if (intervalHours <= 0) return false
  return nowSeconds - lastBackupSeconds >= intervalHours * 3600
}

/** Copy the live object to a timestamped backup key. */
export async function backupCurrent(
  store: ObjectStore,
  name: string,
  nowMs: number
): Promise<void> {
  await store.copy(vaultObjectKey(name), backupObjectKey(name, new Date(nowMs)))
}

/** Delete backups older than the retention window, always keeping the newest few. */
export async function pruneBackups(
  store: ObjectStore,
  name: string,
  nowMs: number,
  retentionDays: number
): Promise<number> {
  const dated = (await store.list(backupPrefix(name)))
    .map((key) => ({ key, ms: parseBackupKey(name, key) }))
    .filter((entry): entry is { key: string; ms: number } => entry.ms !== null)
    .sort((a, b) => b.ms - a.ms)
  const cutoff = nowMs - retentionDays * DAY_SECONDS * 1000
  let deleted = 0
  for (const entry of dated.slice(KEEP_NEWEST_BACKUPS)) {
    if (entry.ms < cutoff) {
      await store.delete(entry.key)
      deleted++
    }
  }
  return deleted
}

export function pruneDue(lastPruneSeconds: number, nowSeconds: number): boolean {
  return nowSeconds - lastPruneSeconds >= DAY_SECONDS
}
