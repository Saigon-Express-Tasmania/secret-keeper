import { childCount, finderKind, nodeSizeBytes } from "@/lib/finder/items"
import type { FinderItem, SortDir, SortKey, SortSpec } from "@/lib/finder/types"

/** Finder-style natural, case-insensitive name ordering ("file2" < "file10"). */
export const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

/** Direction a column sorts in when first chosen (dates/size newest/largest first). */
export function defaultSortDir(key: SortKey): SortDir {
  return key === "name" || key === "kind" ? "asc" : "desc"
}

export function nextSort(current: SortSpec, key: SortKey): SortSpec {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" }
  }
  return { key, dir: defaultSortDir(key) }
}

type Decorated = { item: FinderItem; value: string | number }

function sortValue(item: FinderItem, key: SortKey): string | number {
  switch (key) {
    case "name":
      return item.name
    case "kind":
      return finderKind(item.node)
    case "modified":
      return item.node.modifiedAt ?? ""
    case "created":
      return item.node.createdAt ?? ""
    case "deleted":
      return item.deletedAt ?? ""
    case "size":
      return item.kind === "dir"
        ? nodeSizeBytes(item.node) + childCount(item.node) * 1e-6
        : nodeSizeBytes(item.node)
  }
}

/** Stable Finder sort (optionally keeping folders on top in either direction). */
export function sortItems(
  items: FinderItem[],
  spec: SortSpec,
  foldersOnTop: boolean
): FinderItem[] {
  const decorated: Decorated[] = items.map((item) => ({
    item,
    value: sortValue(item, spec.key),
  }))
  const sign = spec.dir === "asc" ? 1 : -1
  decorated.sort((a, b) => {
    if (foldersOnTop && a.item.kind !== b.item.kind) {
      return a.item.kind === "dir" ? -1 : 1
    }
    let cmp: number
    if (typeof a.value === "number" && typeof b.value === "number") {
      cmp = a.value - b.value
    } else if (spec.key === "name" || spec.key === "kind") {
      cmp = nameCollator.compare(String(a.value), String(b.value))
    } else {
      cmp = String(a.value).localeCompare(String(b.value))
    }
    if (cmp !== 0) return cmp * sign
    return nameCollator.compare(a.item.name, b.item.name)
  })
  return decorated.map((d) => d.item)
}
