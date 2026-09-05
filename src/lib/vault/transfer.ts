/**
 * Encrypted vault export/import helpers.
 * Export packs a CKV2 blob (same format as vault.enc).
 * Import decrypts a backup and re-encrypts file bodies under the live DEK
 * into a new unique root folder so existing paths are never overwritten.
 */

import {
  decryptFileJson,
  encryptFileJson,
} from "@/lib/crypto/file"
import {
  decryptVault,
  encryptVault,
  type EncryptedVaultBlob,
} from "@/lib/crypto/vault"
import {
  copyNodeMeta,
  joinPath,
  mkdir,
  pathBasename,
  placeNode,
  uniqueSiblingPath,
  type FsDir,
  type FsNode,
  type VaultArchive,
} from "@/lib/vault/fs"
import {
  archiveForSave,
  prepareSessionArchive,
} from "@/lib/vault/session"

/** Build a pack-ready archive for export (live workspace only; no recycle bin). */
export function archiveForExport(
  payload: VaultArchive,
  fileDekBytes: Uint8Array
): VaultArchive {
  const packed = archiveForSave(payload, fileDekBytes)
  return {
    ...packed,
    recycleBin: [],
  }
}

/** Encrypt the current vault as a downloadable CKV2 blob. */
export async function buildExportBlob(
  payload: VaultArchive,
  fileDekBytes: Uint8Array,
  masterPassword: string
): Promise<EncryptedVaultBlob> {
  return encryptVault(archiveForExport(payload, fileDekBytes), masterPassword)
}

function todayStamp(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Suggested download filename for an export. */
export function exportFilename(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `keep-export-${y}-${m}-${day}.ckv`
}

/**
 * Re-encrypt an imported directory tree under the destination DEK.
 * Preserves names, icons, and folder structure; never copies ciphertext as-is.
 */
async function reencryptTree(
  from: FsDir,
  sourceKey: CryptoKey,
  destKey: CryptoKey
): Promise<FsDir> {
  const entries: Record<string, FsNode> = {}

  for (const [name, child] of Object.entries(from.entries)) {
    if (child.type === "dir") {
      entries[name] = await reencryptTree(child, sourceKey, destKey)
    } else {
      const json = await decryptFileJson(
        { nonce: child.nonce, ciphertext: child.ciphertext },
        sourceKey
      )
      const enc = await encryptFileJson(json, destKey)
      entries[name] = {
        type: "file",
        nonce: enc.nonce,
        ciphertext: enc.ciphertext,
        ...copyNodeMeta(child),
      }
    }
  }

  return {
    type: "dir",
    entries,
    ...copyNodeMeta(from),
  }
}

export type ImportIntoFolderResult = {
  /** Path of the new isolated root folder. */
  folderPath: string
}

/**
 * Decrypt an exported CKV2 blob and merge its root entries into a new
 * unique folder under the live vault. Existing paths are never overwritten.
 */
export async function mergeImportIntoArchive(
  liveArchive: VaultArchive,
  liveDekKey: CryptoKey,
  blob: EncryptedVaultBlob,
  importPassword: string
): Promise<ImportIntoFolderResult> {
  const raw = await decryptVault(blob, importPassword)
  const prepared = await prepareSessionArchive(raw)

  const folderName = `Imported ${todayStamp()}`
  const folderPath = uniqueSiblingPath(
    liveArchive,
    "",
    folderName,
    "imported"
  )
  const leafName = pathBasename(folderPath)

  mkdir(liveArchive, folderPath, {
    icon: "fluent-color:document-folder-16",
  })

  const reencrypted = await reencryptTree(
    prepared.payload.root,
    prepared.fileDekKey,
    liveDekKey
  )

  for (const [name, child] of Object.entries(reencrypted.entries)) {
    placeNode(liveArchive, joinPath(folderPath, name), child)
  }

  // Apply folder icon/meta on the destination leaf if the import had root meta
  const dest = liveArchive.root.entries[leafName]
  if (dest && dest.type === "dir") {
    if (!dest.icon) {
      dest.icon = "fluent-color:document-folder-16"
    }
  }

  return { folderPath }
}
