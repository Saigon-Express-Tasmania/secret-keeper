/**
 * Soft-delete / restore / purge for vault Recycle Bin.
 * Bin entries keep encrypted file bodies; restore never decrypts.
 */

import {
  cloneNode,
  getNode,
  parentPath,
  pathBasename,
  pathIsUnderAny,
  placeNode,
  pruneDescendantPaths,
  removeNode,
  splitPath,
  uniqueSiblingPath,
  type FsDir,
  type RecycleBinEntry,
  type VaultArchive,
} from "@/lib/vault/fs"

export { pathIsUnderAny, pruneDescendantPaths }

function ensureBin(archive: VaultArchive): RecycleBinEntry[] {
  if (!archive.recycleBin) {
    archive.recycleBin = []
  }
  return archive.recycleBin
}

export function listRecycleBin(archive: VaultArchive): RecycleBinEntry[] {
  const bin = archive.recycleBin ?? []
  return [...bin].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

/**
 * Move selected paths into the recycle bin (whole folder trees as one entry).
 * Refuses the empty vault-root path.
 */
export function moveToRecycleBin(
  archive: VaultArchive,
  paths: string[]
): RecycleBinEntry[] {
  const targets = pruneDescendantPaths(paths)
  if (targets.length === 0) return []

  const bin = ensureBin(archive)
  const created: RecycleBinEntry[] = []
  const now = new Date().toISOString()

  for (const path of targets) {
    if (splitPath(path).length === 0) {
      throw new Error("Cannot delete the vault root.")
    }
    const node = getNode(archive, path)
    if (!node) {
      throw new Error(`Path not found: ${path}`)
    }
    const entry: RecycleBinEntry = {
      id: crypto.randomUUID(),
      originalPath: path,
      deletedAt: now,
      node: cloneNode(node),
    }
    bin.push(entry)
    created.push(entry)
    removeNode(archive, path)
  }

  archive.updatedAt = now
  return created
}

/**
 * Pick a free path under the original parent when originalPath is taken.
 * e.g. `notes/foo` → `notes/foo (restored)`, `notes/foo (restored 2)`, …
 */
export function uniqueRestorePath(
  archive: VaultArchive,
  originalPath: string
): string {
  if (!getNode(archive, originalPath)) return originalPath
  return uniqueSiblingPath(
    archive,
    parentPath(originalPath),
    pathBasename(originalPath),
    "restored"
  )
}

/** Restore bin entries by id; returns restored paths. */
export function restoreFromRecycleBin(
  archive: VaultArchive,
  ids: string[]
): string[] {
  const bin = ensureBin(archive)
  const idSet = new Set(ids)
  const restored: string[] = []

  const remaining: RecycleBinEntry[] = []
  for (const entry of bin) {
    if (!idSet.has(entry.id)) {
      remaining.push(entry)
      continue
    }
    const target = uniqueRestorePath(archive, entry.originalPath)
    placeNode(archive, target, entry.node)
    restored.push(target)
  }

  archive.recycleBin = remaining
  archive.updatedAt = new Date().toISOString()
  return restored
}

/** Permanently delete bin entries by id. */
export function purgeRecycleBin(
  archive: VaultArchive,
  ids: string[]
): number {
  const bin = ensureBin(archive)
  const idSet = new Set(ids)
  const before = bin.length
  archive.recycleBin = bin.filter((e) => !idSet.has(e.id))
  archive.updatedAt = new Date().toISOString()
  return before - (archive.recycleBin?.length ?? 0)
}

export type { RecycleBinEntry, FsDir }
