/**
 * Soft-delete / restore / purge for vault Recycle Bin.
 * Bin entries keep encrypted file bodies; restore never decrypts.
 */

import {
  getNode,
  joinPath,
  mkdir,
  parentPath,
  pathBasename,
  removeNode,
  splitPath,
  type FsDir,
  type FsNode,
  type RecycleBinEntry,
  type VaultArchive,
} from "@/lib/vault/fs"

function ensureBin(archive: VaultArchive): RecycleBinEntry[] {
  if (!archive.recycleBin) {
    archive.recycleBin = []
  }
  return archive.recycleBin
}

function cloneNode(node: FsNode): FsNode {
  return structuredClone(node)
}

/** Drop paths that are under another selected path (parent wins). */
export function pruneDescendantPaths(paths: string[]): string[] {
  const normalized = [
    ...new Set(
      paths
        .map((p) => p.replace(/^\/+|\/+$/g, ""))
        .filter((p) => p.length > 0)
    ),
  ].sort((a, b) => a.length - b.length || a.localeCompare(b))

  const kept: string[] = []
  for (const path of normalized) {
    const covered = kept.some(
      (parent) => path === parent || path.startsWith(`${parent}/`)
    )
    if (!covered) kept.push(path)
  }
  return kept
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

function placeNode(
  archive: VaultArchive,
  path: string,
  node: FsNode
): void {
  const parts = splitPath(path)
  if (parts.length === 0) {
    throw new Error("Cannot restore to vault root path.")
  }
  const name = parts[parts.length - 1]!
  const parent = parts.slice(0, -1).join("/")
  if (parent) mkdir(archive, parent)

  const parentNode = parent ? getNode(archive, parent) : archive.root
  if (!parentNode || parentNode.type !== "dir") {
    throw new Error(`Parent is not a directory: ${parent || "/"}`)
  }
  if (name in parentNode.entries) {
    throw new Error(`Path already exists: ${path}`)
  }
  parentNode.entries[name] = cloneNode(node)
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

  const parent = parentPath(originalPath)
  const base = pathBasename(originalPath)
  // Split extension for files like github.json → "github (restored).json"
  const lastDot = base.lastIndexOf(".")
  const hasExt = lastDot > 0
  const stem = hasExt ? base.slice(0, lastDot) : base
  const ext = hasExt ? base.slice(lastDot) : ""

  let candidate = joinPath(parent, `${stem} (restored)${ext}`)
  let n = 2
  while (getNode(archive, candidate)) {
    candidate = joinPath(parent, `${stem} (restored ${n})${ext}`)
    n++
  }
  return candidate
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

/** True if path equals or is under any of the given prefixes. */
export function pathIsUnderAny(path: string, prefixes: string[]): boolean {
  return prefixes.some(
    (p) => path === p || path.startsWith(`${p}/`)
  )
}

export type { RecycleBinEntry, FsDir }
