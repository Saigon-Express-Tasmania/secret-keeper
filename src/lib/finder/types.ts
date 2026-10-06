import type { FsNode } from "@/lib/vault/fs"

export type ViewMode = "icons" | "list" | "columns" | "cards"

export type SortKey = "name" | "kind" | "modified" | "created" | "size" | "deleted"
export type SortDir = "asc" | "desc"
export type SortSpec = { key: SortKey; dir: SortDir }

/** Where the Finder window points: a vault path (folder or file) or the Trash. */
export type Location = { kind: "path"; path: string } | { kind: "trash" }

/** One row / icon in any Finder view. */
export type FinderItem = {
  /** Selection key: vault path, `trash:<id>`, or `phantom:<path>`. */
  key: string
  /** Vault path (original path for Trash items). */
  path: string
  name: string
  node: FsNode
  kind: "dir" | "file"
  source: "vault" | "trash" | "phantom"
  trashId?: string
  deletedAt?: string
  /** Parent folder path (search "Where" / Trash "Original Location"). */
  where?: string
  /** List-view tree depth (0 = top level). */
  depth?: number
  expandable?: boolean
  expanded?: boolean
}

/** A node moved (`to` = new path) or removed (`to` = null). */
export type PathChange = { from: string; to: string | null }

/** In-app clipboard; never touches the system clipboard. */
export type FinderClipboard = { mode: "cut" | "copy"; paths: string[] } | null

export const TRASH_KEY_PREFIX = "trash:"
export const PHANTOM_KEY_PREFIX = "phantom:"

export function isVaultKey(key: string): boolean {
  return !key.startsWith(TRASH_KEY_PREFIX) && !key.startsWith(PHANTOM_KEY_PREFIX)
}
