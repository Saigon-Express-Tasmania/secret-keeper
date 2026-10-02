import { folderItems } from "@/lib/finder/items"
import { sortItems } from "@/lib/finder/sort"
import type { FinderItem, SortSpec } from "@/lib/finder/types"
import type { VaultArchive } from "@/lib/vault/fs"

/**
 * List-view rows for `dir` with expanded sub-folders inlined (depth-first),
 * each level sorted independently like Finder's disclosure triangles.
 */
export function flattenTree(
  archive: VaultArchive,
  dir: string,
  expanded: ReadonlySet<string>,
  spec: SortSpec,
  foldersOnTop: boolean,
  extra: FinderItem[] = []
): FinderItem[] {
  const out: FinderItem[] = []
  function visit(path: string, depth: number, add: FinderItem[]) {
    const items = sortItems([...folderItems(archive, path), ...add], spec, foldersOnTop)
    for (const item of items) {
      const isDir = item.kind === "dir" && item.source === "vault"
      const open = isDir && expanded.has(item.path)
      out.push({ ...item, depth, expandable: isDir, expanded: open })
      if (open) visit(item.path, depth + 1, [])
    }
  }
  visit(dir, 0, extra)
  return out
}
