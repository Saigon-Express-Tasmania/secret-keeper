import { folderItems, safeGetNode } from "@/lib/finder/items"
import { sortItems } from "@/lib/finder/sort"
import type { FinderItem, SortSpec } from "@/lib/finder/types"
import { splitPath, type VaultArchive } from "@/lib/vault/fs"

export type FinderColumn = { dir: string; items: FinderItem[] }

/** Column-view columns from the vault root down to `dir`. */
export function buildColumns(
  archive: VaultArchive,
  dir: string,
  spec: SortSpec,
  foldersOnTop: boolean,
  extraForLast: FinderItem[] = []
): FinderColumn[] {
  const parts = splitPath(dir)
  const dirs = [""]
  for (let i = 0; i < parts.length; i++) dirs.push(parts.slice(0, i + 1).join("/"))
  const columns: FinderColumn[] = []
  for (const [i, d] of dirs.entries()) {
    const node = safeGetNode(archive, d)
    if (!node || node.type !== "dir") break
    const extra = i === dirs.length - 1 ? extraForLast : []
    columns.push({
      dir: d,
      items: sortItems([...folderItems(archive, d), ...extra], spec, foldersOnTop),
    })
  }
  return columns
}
