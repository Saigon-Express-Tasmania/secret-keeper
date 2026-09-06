import {
  createEmptyVault,
  decryptVault,
  encryptVault,
  type EncryptedVaultBlob,
} from "@/lib/crypto/vault"
import { createStorage, getVaultObjectKey } from "@/lib/storage"
import { loadLocalVault, saveLocalVault } from "@/lib/storage/localCache"
import { scheduleVaultBackup } from "@/lib/vault/backup"
import { mergeVaults } from "@/lib/vault/merge"
import type { RawVaultArchive, VaultArchive } from "@/lib/vault/fs"
import {
  archiveForSave,
  prepareSessionArchive,
  type PreparedVault,
} from "@/lib/vault/session"

export type UnlockResult = PreparedVault & {
  /** Ciphertext currently mirrored locally / remote after unlock. */
  blob: EncryptedVaultBlob
}

async function tryDecrypt(
  blob: EncryptedVaultBlob,
  masterPassword: string
): Promise<RawVaultArchive | null> {
  try {
    return await decryptVault(blob, masterPassword)
  } catch {
    return null
  }
}

/**
 * Unlock flow:
 * 1. Download remote ciphertext (null if missing)
 * 2. Load local ciphertext replica
 * 3. Decrypt available copies, merge (remote-wins stub)
 * 4. Migrate to v3 per-file encryption; strip DEK from session payload
 * 5. Persist chosen ciphertext; re-upload if migrated or remote missing
 * 6. Schedule a best-effort remote backup (does not block or fail unlock)
 */
export async function unlockVault(
  masterPassword: string
): Promise<UnlockResult> {
  const storage = createStorage()
  const objectKey = getVaultObjectKey()

  const remoteBlob = await storage.download(objectKey)
  const localBlob = loadLocalVault(objectKey)

  let remotePayload: RawVaultArchive | null = null
  let localPayload: RawVaultArchive | null = null

  if (remoteBlob) {
    remotePayload = await decryptVault(remoteBlob, masterPassword)
  }
  if (localBlob) {
    localPayload = await tryDecrypt(localBlob, masterPassword)
  }

  if (!remoteBlob && localBlob && !localPayload) {
    throw new Error("Invalid master password.")
  }

  const merged = mergeVaults({ local: localPayload, remote: remotePayload })

  if (merged.source === "empty") {
    const prepared = await createEmptyVault()
    const blob = await encryptVault(
      archiveForSave(prepared.payload, prepared.fileDekBytes),
      masterPassword
    )
    await storage.upload(objectKey, blob)
    saveLocalVault(objectKey, blob)
    scheduleVaultBackup(storage, blob)
    return { ...prepared, blob }
  }

  const prepared = await prepareSessionArchive(merged.payload)

  let blob: EncryptedVaultBlob

  if (prepared.migrated) {
    blob = await encryptVault(
      archiveForSave(prepared.payload, prepared.fileDekBytes),
      masterPassword
    )
    await storage.upload(objectKey, blob)
    saveLocalVault(objectKey, blob)
  } else if (merged.source === "remote" && remoteBlob) {
    blob = remoteBlob
    saveLocalVault(objectKey, blob)
  } else if (merged.source === "local" && localBlob) {
    blob = localBlob
    saveLocalVault(objectKey, blob)
    await storage.upload(objectKey, blob)
  } else {
    blob = await encryptVault(
      archiveForSave(prepared.payload, prepared.fileDekBytes),
      masterPassword
    )
    await storage.upload(objectKey, blob)
    saveLocalVault(objectKey, blob)
  }

  scheduleVaultBackup(storage, blob)
  return { ...prepared, blob }
}

/**
 * Encrypt session archive (with DEK re-attached) and upload + cache.
 */
export async function saveVault(
  payload: VaultArchive,
  fileDekBytes: Uint8Array,
  masterPassword: string
): Promise<EncryptedVaultBlob> {
  const storage = createStorage()
  const objectKey = getVaultObjectKey()
  const blob = await encryptVault(
    archiveForSave(payload, fileDekBytes),
    masterPassword
  )
  await storage.upload(objectKey, blob)
  saveLocalVault(objectKey, blob)
  return blob
}
