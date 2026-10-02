import {
  getNode,
  joinPath,
  listDir,
  listRootDirs,
  parentPath,
  pathBasename,
  searchArchive,
  type FsNode,
  type VaultArchive,
} from "@/lib/vault/fs"
import { listRecycleBin } from "@/lib/vault/recycleBin"
import {
  PHANTOM_KEY_PREFIX,
  TRASH_KEY_PREFIX,
  type FinderItem,
} from "@/lib/finder/types"

/** `getNode` that returns null instead of throwing on odd path segments. */
export function safeGetNode(archive: VaultArchive, path: string): FsNode | null {
  try {
    return getNode(archive, path)
  } catch {
    return null
  }
}

export function vaultItem(path: string, node: FsNode, where?: string): FinderItem {
  return {
    key: path,
    path,
    name: pathBasename(path),
    node,
    kind: node.type === "dir" ? "dir" : "file",
    source: "vault",
    ...(where !== undefined ? { where } : {}),
  }
}

/** Direct children of a folder (unsorted). Empty when `dir` is not a folder. */
export function folderItems(archive: VaultArchive, dir: string): FinderItem[] {
  const node = safeGetNode(archive, dir)
  if (!node || node.type !== "dir") return []
  return listDir(archive, dir).map(({ name, node: child }) =>
    vaultItem(joinPath(dir, name), child)
  )
}

/** Name / ancestor-folder search, optionally limited to a folder. */
export function searchItems(
  archive: VaultArchive,
  query: string,
  scopeDir?: string
): FinderItem[] {
  const out: FinderItem[] = []
  for (const hit of searchArchive(archive, query, { under: scopeDir })) {
    const node = safeGetNode(archive, hit.path)
    if (node) out.push(vaultItem(hit.path, node, parentPath(hit.path)))
  }
  return out
}

export function trashKey(id: string): string {
  return `${TRASH_KEY_PREFIX}${id}`
}

export function trashItems(archive: VaultArchive): FinderItem[] {
  return listRecycleBin(archive).map((entry) => ({
    key: trashKey(entry.id),
    path: entry.originalPath,
    name: pathBasename(entry.originalPath),
    node: entry.node,
    kind: entry.node.type === "dir" ? "dir" : "file",
    source: "trash" as const,
    trashId: entry.id,
    deletedAt: entry.deletedAt,
    where: parentPath(entry.originalPath),
  }))
}

/** Placeholder item shown while naming a new folder / account. */
export function phantomItem(
  parentDir: string,
  kind: "folder" | "file",
  name: string
): FinderItem {
  const path = joinPath(parentDir, name)
  const t = new Date().toISOString()
  const node: FsNode =
    kind === "folder"
      ? { type: "dir", entries: {}, createdAt: t, modifiedAt: t }
      : { type: "file", nonce: "", ciphertext: "", createdAt: t, modifiedAt: t }
  return {
    key: `${PHANTOM_KEY_PREFIX}${path}`,
    path,
    name,
    node,
    kind: kind === "folder" ? "dir" : "file",
    source: "phantom",
  }
}

export function rootFolderItems(archive: VaultArchive): FinderItem[] {
  return listRootDirs(archive).map(({ name, node }) => vaultItem(name, node))
}

/** Finder "Kind" column. Files are always encrypted account documents. */
export function finderKind(node: FsNode): string {
  return node.type === "dir" ? "Folder" : "Account"
}

/** Decoded byte length of a base64 string without decoding it. */
export function base64ByteLength(b64: string | undefined): number {
  if (!b64) return 0
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad)
}

/** Encrypted size of a file, or the recursive size of a folder's files. */
export function nodeSizeBytes(node: FsNode): number {
  if (node.type === "file") return base64ByteLength(node.ciphertext)
  let total = 0
  for (const child of Object.values(node.entries)) total += nodeSizeBytes(child)
  return total
}

export function childCount(node: FsNode): number {
  return node.type === "dir" ? Object.keys(node.entries).length : 0
}
