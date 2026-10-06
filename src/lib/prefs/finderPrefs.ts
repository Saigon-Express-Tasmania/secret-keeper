import type { SortKey, SortSpec, ViewMode } from "@/lib/finder/types"

/** Finder window layout preferences. Never stores vault names or paths. */
export type FinderPrefs = {
  view: ViewMode
  sort: SortSpec
  trashSort: SortSpec
  foldersOnTop: boolean
  iconSize: number
  showItemInfo: boolean
  showCreated: boolean
  calculateSizes: boolean
  sidebar: boolean
  sidebarWidth: number
  pathBar: boolean
  statusBar: boolean
  zoomed: boolean
}

const STORAGE_KEY = "ck:finder"
/** v2: Cards became the default view; v1 prefs keep everything but `view`. */
const VERSION = 2

export const ICON_SIZE_MIN = 32
export const ICON_SIZE_MAX = 128
export const SIDEBAR_MIN = 150
export const SIDEBAR_MAX = 320

export const DEFAULT_FINDER_PREFS: FinderPrefs = {
  view: "cards",
  sort: { key: "name", dir: "asc" },
  trashSort: { key: "deleted", dir: "desc" },
  foldersOnTop: true,
  iconSize: 64,
  showItemInfo: true,
  showCreated: false,
  calculateSizes: false,
  sidebar: true,
  sidebarWidth: 196,
  pathBar: true,
  statusBar: true,
  zoomed: false,
}

const VIEWS: readonly ViewMode[] = ["icons", "list", "columns", "cards"]
const SORT_KEYS: readonly SortKey[] = ["name", "kind", "modified", "created", "size", "deleted"]

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}

function asNumber(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback
}

function asSort(v: unknown, fallback: SortSpec): SortSpec {
  if (!v || typeof v !== "object") return fallback
  const { key, dir } = v as { key?: unknown; dir?: unknown }
  if (!SORT_KEYS.includes(key as SortKey)) return fallback
  if (dir !== "asc" && dir !== "desc") return fallback
  return { key: key as SortKey, dir }
}

/** Read prefs, validating each field (bad or missing values use defaults). */
export function readFinderPrefs(): FinderPrefs {
  const d = DEFAULT_FINDER_PREFS
  let raw: Record<string, unknown> = {}
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = text ? JSON.parse(text) : null
    const v = parsed && typeof parsed === "object" ? (parsed as { v?: unknown }).v : undefined
    if (v === VERSION) {
      raw = parsed as Record<string, unknown>
    } else if (v === 1) {
      const { view: _view, ...rest } = parsed as Record<string, unknown>
      void _view
      raw = rest
    }
  } catch {
    raw = {}
  }
  const sort = asSort(raw.sort, d.sort)
  return {
    view: VIEWS.includes(raw.view as ViewMode) ? (raw.view as ViewMode) : d.view,
    sort: sort.key === "deleted" ? d.sort : sort,
    trashSort: asSort(raw.trashSort, d.trashSort),
    foldersOnTop: asBool(raw.foldersOnTop, d.foldersOnTop),
    iconSize: asNumber(raw.iconSize, d.iconSize, ICON_SIZE_MIN, ICON_SIZE_MAX),
    showItemInfo: asBool(raw.showItemInfo, d.showItemInfo),
    showCreated: asBool(raw.showCreated, d.showCreated),
    calculateSizes: asBool(raw.calculateSizes, d.calculateSizes),
    sidebar: asBool(raw.sidebar, d.sidebar),
    sidebarWidth: asNumber(raw.sidebarWidth, d.sidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX),
    pathBar: asBool(raw.pathBar, d.pathBar),
    statusBar: asBool(raw.statusBar, d.statusBar),
    zoomed: asBool(raw.zoomed, d.zoomed),
  }
}

export function writeFinderPrefs(prefs: FinderPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, ...prefs }))
  } catch {
    // Quota / private mode — ignore
  }
}
