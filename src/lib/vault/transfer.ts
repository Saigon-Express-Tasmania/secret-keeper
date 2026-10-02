/**
 * Export/import helpers.
 * Exports are CKV3 files (see sealExportFile); this module prepares the
 * archive for export and merges a decrypted import into the live vault,
 * re-encrypting every file body under the live file DEK.
 */

import { decryptFileJson, encryptFileJson } from "@/lib/crypto/file"
import {
  copyNodeMeta,
  getNode,
  joinPath,
  mkdir,
  pathBasename,
  placeNode,
  uniqueSiblingPath,
  type FsDir,
  type FsNode,
  type RawVaultArchive,
  type RecycleBinEntry,
  type VaultArchive,
} from "@/lib/vault/fs"
import { archiveForSave, prepareSessionArchive } from "@/lib/vault/session"

/** Pack-ready archive for export: live workspace only, no recycle bin, no vault keys. */
export function archiveForExport(
  payload: VaultArchive,
  fileDekBytes: Uint8Array
): VaultArchive {
  return { ...archiveForSave(payload, fileDekBytes), recycleBin: [] }
}

function todayStamp(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Suggested download filename for an export. */
export function exportFilename(date = new Date()): string {
  return `keep-export-${todayStamp(date)}.ckx`
}

/** Re-encrypt one file or folder under another file DEK. */
export async function reencryptNode(
  node: FsNode,
  sourceKey: CryptoKey,
  destKey: CryptoKey
): Promise<FsNode> {
  if (node.type === "dir") return reencryptTree(node, sourceKey, destKey)
  const json = await decryptFileJson({ nonce: node.nonce, ciphertext: node.ciphertext }, sourceKey)
  const enc = await encryptFileJson(json, destKey)
  return { type: "file", nonce: enc.nonce, ciphertext: enc.ciphertext, ...copyNodeMeta(node) }
}

/**
 * Re-encrypt a directory tree under another file DEK.
 * Preserves names, icons and folder structure; never copies ciphertext as-is.
 */
export async function reencryptTree(
  from: FsDir,
  sourceKey: CryptoKey,
  destKey: CryptoKey
): Promise<FsDir> {
  const entries: Record<string, FsNode> = {}
  for (const [name, child] of Object.entries(from.entries)) {
    entries[name] = await reencryptNode(child, sourceKey, destKey)
  }
  return { type: "dir", entries, ...copyNodeMeta(from) }
}

/** Merge `incoming` into `dest`: folders merge, colliding files get "(imported)". */
function mergeDirInto(archive: VaultArchive, destPath: string, incoming: FsDir): void {
  for (const [name, child] of Object.entries(incoming.entries)) {
    if (child.type === "dir") {
      const existing = getNode(archive, joinPath(destPath, name))
      const target =
        existing?.type === "file"
          ? uniqueSiblingPath(archive, destPath, name, "imported")
          : joinPath(destPath, name)
      mkdir(archive, target, child.icon ? { icon: child.icon } : undefined)
      mergeDirInto(archive, target, child)
    } else {
      placeNode(archive, uniqueSiblingPath(archive, destPath, name, "imported"), child)
    }
  }
}

export type ImportIntoFolderResult = {
  /** Folder that received the import ("" when merged into the root). */
  folderPath: string
  files: number
}

function countFiles(node: FsNode): number {
  if (node.type === "file") return 1
  return Object.values(node.entries).reduce((sum, child) => sum + countFiles(child), 0)
}

/**
 * Merge a decrypted export/import archive into the live vault.
 * Default: a new "Imported <date>" folder (existing paths never overwritten).
 * intoRoot: merge into the root (used for the one-time legacy migration).
 * Recycle-bin entries come along, re-encrypted, under fresh ids.
 */
export async function mergeImportIntoArchive(
  liveArchive: VaultArchive,
  liveDekKey: CryptoKey,
  raw: RawVaultArchive,
  options: { intoRoot?: boolean } = {}
): Promise<ImportIntoFolderResult> {
  const prepared = await prepareSessionArchive(raw)
  const reencrypted = await reencryptTree(prepared.payload.root, prepared.fileDekKey, liveDekKey)

  let folderPath = ""
  if (options.intoRoot) {
    mergeDirInto(liveArchive, "", reencrypted)
  } else {
    folderPath = uniqueSiblingPath(liveArchive, "", `Imported ${todayStamp()}`, "imported")
    mkdir(liveArchive, folderPath, { icon: "fluent-color:document-folder-16" })
    for (const [name, child] of Object.entries(reencrypted.entries)) {
      placeNode(liveArchive, joinPath(folderPath, name), child)
    }
    const dest = liveArchive.root.entries[pathBasename(folderPath)]
    if (dest && dest.type === "dir" && !dest.icon) {
      dest.icon = "fluent-color:document-folder-16"
    }
  }

  const bin: RecycleBinEntry[] = liveArchive.recycleBin ?? []
  for (const entry of prepared.payload.recycleBin ?? []) {
    bin.push({
      id: crypto.randomUUID(),
      originalPath: joinPath(folderPath, entry.originalPath),
      deletedAt: entry.deletedAt,
      node: await reencryptNode(entry.node, prepared.fileDekKey, liveDekKey),
    })
  }
  liveArchive.recycleBin = bin

  return { folderPath, files: countFiles(reencrypted) }
}
