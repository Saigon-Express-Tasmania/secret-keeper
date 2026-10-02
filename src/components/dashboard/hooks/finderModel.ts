import { buildColumns, type FinderColumn } from "@/lib/finder/columns"
import {
  folderItems,
  phantomItem,
  safeGetNode,
  searchItems,
  trashItems,
  vaultItem,
} from "@/lib/finder/items"
import { nearestExistingDir } from "@/lib/finder/paths"
import { sortItems } from "@/lib/finder/sort"
import { currentLocation, type FinderState } from "@/lib/finder/state"
import { flattenTree } from "@/lib/finder/tree"
import type {
  FinderItem,
  Location,
  SortSpec,
  ViewMode,
} from "@/lib/finder/types"
import type { FinderPrefs } from "@/lib/prefs/finderPrefs"
import {
  parentPath,
  pathBasename,
  type FsFile,
  type VaultArchive,
} from "@/lib/vault/fs"

export type FinderMode = "folder" | "file" | "search" | "trash"

export type FinderModel = {
  location: Location
  mode: FinderMode
  /** Folder or file path shown (meaningless in Trash). */
  path: string
  /** Folder that New Folder / Paste target. */
  containerDir: string
  fileNode: FsFile | null
  /** The open file as an item (file mode), so commands can target it. */
  fileItem: FinderItem | null
  view: ViewMode
  sort: SortSpec
  /** Icons/List: everything shown. Columns: the focused column. */
  items: FinderItem[]
  columns: FinderColumn[] | null
  /** Column view: index of the column holding the selection. */
  focusedColumn: number
  itemsByKey: ReadonlyMap<string, FinderItem>
  orderedKeys: string[]
  selectedItems: FinderItem[]
  title: string
  canGoBack: boolean
  canGoForward: boolean
}

export function deriveFinderModel(
  archive: VaultArchive,
  state: FinderState,
  prefs: FinderPrefs,
  vaultName: string
): FinderModel {
  const location = currentLocation(state)
  let mode: FinderMode
  let path = ""
  let fileNode: FsFile | null = null

  if (location.kind === "trash") {
    mode = "trash"
  } else {
    const node = safeGetNode(archive, location.path)
    if (node?.type === "file") {
      mode = "file"
      path = location.path
      fileNode = node
    } else {
      path = node?.type === "dir" ? location.path : nearestExistingDir(archive, location.path)
      mode = state.search.query.trim() ? "search" : "folder"
    }
  }

  const containerDir = mode === "file" ? parentPath(path) : path
  const sort = mode === "trash" ? prefs.trashSort : prefs.sort
  const view: ViewMode =
    prefs.view === "columns" && (mode === "search" || mode === "trash") ? "list" : prefs.view

  const phantom =
    state.phantom && mode === "folder"
      ? [phantomItem(state.phantom.parentDir, state.phantom.kind, state.phantom.name)]
      : []

  let items: FinderItem[] = []
  let columns: FinderColumn[] | null = null
  let focusedColumn = 0
  const itemsByKey = new Map<string, FinderItem>()

  if (mode === "trash") {
    items = sortItems(trashItems(archive), sort, prefs.foldersOnTop)
  } else if (mode === "search") {
    const scopeDir = state.search.scope === "folder" ? state.search.scopeDir : undefined
    items = sortItems(searchItems(archive, state.search.query, scopeDir), sort, prefs.foldersOnTop)
  } else if (mode === "folder") {
    const extra = phantom.filter((p) => parentPath(p.path) === path)
    if (view === "list") {
      items = flattenTree(archive, path, state.expanded, sort, prefs.foldersOnTop, extra)
    } else if (view === "icons") {
      items = sortItems([...folderItems(archive, path), ...extra], sort, prefs.foldersOnTop)
    } else {
      columns = buildColumns(archive, path, sort, prefs.foldersOnTop, extra)
      const focus = state.selection.focus
      const idx = focus ? columns.findIndex((col) => col.items.some((i) => i.key === focus)) : -1
      focusedColumn = idx >= 0 ? idx : columns.length - 1
      for (const col of columns) for (const item of col.items) itemsByKey.set(item.key, item)
      items = columns[focusedColumn]?.items ?? []
    }
  }
  for (const item of items) itemsByKey.set(item.key, item)

  const selectedItems: FinderItem[] = []
  for (const key of state.selection.keys) {
    const item = itemsByKey.get(key)
    if (item) selectedItems.push(item)
  }

  const fileItem = mode === "file" && fileNode ? vaultItem(path, fileNode) : null

  let title: string
  if (mode === "trash") title = "Trash"
  else if (mode === "search") title = `Searching “${state.search.query.trim()}”`
  else title = path ? pathBasename(path) : vaultName

  return {
    location,
    mode,
    path,
    containerDir,
    fileNode,
    fileItem,
    view,
    sort,
    items,
    columns,
    focusedColumn,
    itemsByKey,
    orderedKeys: items.map((i) => i.key),
    selectedItems,
    title,
    canGoBack: state.index > 0,
    canGoForward: state.index < state.history.length - 1,
  }
}
