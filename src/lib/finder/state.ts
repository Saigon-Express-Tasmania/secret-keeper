import { applyPathChanges, remapLocation } from "@/lib/finder/paths"
import {
  isVaultKey,
  type FinderClipboard,
  type Location,
  type PathChange,
} from "@/lib/finder/types"
import { joinPath, splitPath } from "@/lib/vault/fs"

export type Selection = {
  keys: ReadonlySet<string>
  /** Fixed end of a Shift-range. */
  anchor: string | null
  /** Keyboard cursor / last clicked item. */
  focus: string | null
}

export type SearchState = {
  query: string
  scope: "vault" | "folder"
  /** Folder that "folder" scope refers to (where the search started). */
  scopeDir: string
}

export type FinderState = {
  history: Location[]
  index: number
  search: SearchState
  selection: Selection
  /** Folders expanded with disclosure triangles in List view. */
  expanded: ReadonlySet<string>
  clipboard: FinderClipboard
  rename: { key: string; saving: boolean } | null
  phantom: {
    parentDir: string
    kind: "folder" | "file"
    name: string
    saving: boolean
  } | null
  quickLook: boolean
  infoKey: string | null
}

export type FinderAction =
  | { type: "navigate"; location: Location; select?: string[]; replace?: boolean }
  | { type: "back" }
  | { type: "forward" }
  | { type: "select"; key: string; mode: "replace" | "toggle" | "range"; ordered: readonly string[] }
  | { type: "focusMove"; key: string; extend: boolean; ordered: readonly string[] }
  | { type: "setSelection"; keys: readonly string[]; focus?: string | null }
  | { type: "selectAll"; ordered: readonly string[] }
  | { type: "clearSelection" }
  | { type: "setSearch"; query?: string; scope?: "vault" | "folder"; scopeDir?: string }
  | { type: "setExpanded"; paths: readonly string[]; open: boolean }
  | { type: "setClipboard"; clipboard: FinderClipboard }
  | { type: "renameStart"; key: string }
  | { type: "renameSaving"; saving: boolean }
  | { type: "renameEnd" }
  | { type: "phantomStart"; parentDir: string; kind: "folder" | "file"; name: string }
  | { type: "phantomSaving"; saving: boolean }
  | { type: "phantomEnd" }
  | { type: "pathsChanged"; changes: readonly PathChange[] }
  | { type: "quickLook"; open?: boolean }
  | { type: "info"; key: string | null }

const MAX_HISTORY = 50
const EMPTY = new Set<string>()

export function emptySelection(): Selection {
  return { keys: EMPTY, anchor: null, focus: null }
}

function selectionOf(keys: readonly string[], focus?: string | null): Selection {
  if (keys.length === 0) return emptySelection()
  const f = focus === undefined ? keys[keys.length - 1]! : focus
  return { keys: new Set(keys), anchor: f, focus: f }
}

export function initialFinderState(path: string): FinderState {
  return {
    history: [{ kind: "path", path }],
    index: 0,
    search: { query: "", scope: "vault", scopeDir: "" },
    selection: emptySelection(),
    expanded: EMPTY,
    clipboard: null,
    rename: null,
    phantom: null,
    quickLook: false,
    infoKey: null,
  }
}

export function currentLocation(state: FinderState): Location {
  return state.history[state.index] ?? { kind: "path", path: "" }
}

function sameLocation(a: Location, b: Location): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === "trash" || (b.kind === "path" && a.path === b.path)
}

/**
 * Going "up" (⌘↑, Back to a parent) selects the child you came from, like
 * Finder. Returns that child's path, or null.
 */
function childOnTheWayUp(from: Location, to: Location): string | null {
  if (from.kind !== "path" || to.kind !== "path") return null
  const fromParts = splitPath(from.path)
  const toParts = splitPath(to.path)
  if (fromParts.length <= toParts.length) return null
  for (let i = 0; i < toParts.length; i++) {
    if (fromParts[i] !== toParts[i]) return null
  }
  return joinPath(to.path, fromParts[toParts.length]!)
}

function arrive(state: FinderState, history: Location[], index: number, select?: readonly string[]): FinderState {
  const from = currentLocation(state)
  const to = history[index]!
  let selection: Selection
  if (select && select.length > 0) {
    selection = selectionOf(select)
  } else {
    const child = childOnTheWayUp(from, to)
    selection = child ? selectionOf([child]) : emptySelection()
  }
  return {
    ...state,
    history,
    index,
    search: { ...state.search, query: "" },
    selection,
    rename: null,
    phantom: null,
    quickLook: false,
  }
}

function rangeKeys(ordered: readonly string[], a: string, b: string): string[] {
  const i = ordered.indexOf(a)
  const j = ordered.indexOf(b)
  if (i < 0 || j < 0) return [b]
  const [lo, hi] = i <= j ? [i, j] : [j, i]
  return ordered.slice(lo, hi + 1)
}

function remapKeySet(
  keys: ReadonlySet<string>,
  changes: readonly PathChange[]
): ReadonlySet<string> {
  const next = new Set<string>()
  for (const key of keys) {
    if (!isVaultKey(key)) {
      next.add(key)
      continue
    }
    const mapped = applyPathChanges(key, changes)
    if (mapped !== null) next.add(mapped)
  }
  return next
}

function remapKey(key: string | null, changes: readonly PathChange[]): string | null {
  if (key === null || !isVaultKey(key)) return key
  return applyPathChanges(key, changes)
}

export function finderReducer(state: FinderState, action: FinderAction): FinderState {
  switch (action.type) {
    case "navigate": {
      const current = currentLocation(state)
      if (sameLocation(current, action.location)) {
        return arrive(state, state.history, state.index, action.select)
      }
      if (action.replace) {
        const history = state.history.slice()
        history[state.index] = action.location
        return arrive(state, history, state.index, action.select)
      }
      const history = [...state.history.slice(0, state.index + 1), action.location]
      const overflow = Math.max(0, history.length - MAX_HISTORY)
      return arrive(state, history.slice(overflow), history.length - 1 - overflow, action.select)
    }
    case "back":
      if (state.index <= 0) return state
      return arrive(state, state.history, state.index - 1)
    case "forward":
      if (state.index >= state.history.length - 1) return state
      return arrive(state, state.history, state.index + 1)

    case "select": {
      const { key, mode, ordered } = action
      if (mode === "replace") return { ...state, selection: selectionOf([key]) }
      if (mode === "toggle") {
        const keys = new Set(state.selection.keys)
        if (keys.has(key)) keys.delete(key)
        else keys.add(key)
        return { ...state, selection: { keys, anchor: key, focus: key } }
      }
      const anchor = state.selection.anchor ?? key
      return {
        ...state,
        selection: { keys: new Set(rangeKeys(ordered, anchor, key)), anchor, focus: key },
      }
    }
    case "focusMove": {
      if (!action.extend) return { ...state, selection: selectionOf([action.key]) }
      const anchor = state.selection.anchor ?? action.key
      return {
        ...state,
        selection: {
          keys: new Set(rangeKeys(action.ordered, anchor, action.key)),
          anchor,
          focus: action.key,
        },
      }
    }
    case "setSelection":
      return { ...state, selection: selectionOf(action.keys, action.focus) }
    case "selectAll": {
      if (action.ordered.length === 0) return state
      return {
        ...state,
        selection: {
          keys: new Set(action.ordered),
          anchor: action.ordered[0]!,
          focus: state.selection.focus ?? action.ordered[0]!,
        },
      }
    }
    case "clearSelection":
      if (state.selection.keys.size === 0) return state
      return { ...state, selection: emptySelection(), quickLook: false }

    case "setSearch": {
      const query = action.query ?? state.search.query
      const search: SearchState = {
        query,
        scope: action.scope ?? state.search.scope,
        scopeDir: action.scopeDir ?? state.search.scopeDir,
      }
      const changed = query.trim() !== state.search.query.trim() || search.scope !== state.search.scope
      return {
        ...state,
        search,
        selection: changed ? emptySelection() : state.selection,
        rename: changed ? null : state.rename,
        phantom: changed ? null : state.phantom,
      }
    }

    case "setExpanded": {
      const expanded = new Set(state.expanded)
      for (const p of action.paths) {
        if (action.open) expanded.add(p)
        else expanded.delete(p)
      }
      return { ...state, expanded }
    }

    case "setClipboard":
      return { ...state, clipboard: action.clipboard }

    case "renameStart":
      return { ...state, rename: { key: action.key, saving: false }, phantom: null, quickLook: false }
    case "renameSaving":
      return state.rename ? { ...state, rename: { ...state.rename, saving: action.saving } } : state
    case "renameEnd":
      return state.rename ? { ...state, rename: null } : state

    case "phantomStart":
      return {
        ...state,
        phantom: { parentDir: action.parentDir, kind: action.kind, name: action.name, saving: false },
        rename: null,
        quickLook: false,
        selection: emptySelection(),
      }
    case "phantomSaving":
      return state.phantom ? { ...state, phantom: { ...state.phantom, saving: action.saving } } : state
    case "phantomEnd":
      return state.phantom ? { ...state, phantom: null } : state

    case "pathsChanged": {
      const { changes } = action
      if (changes.length === 0) return state
      const history = state.history.map((loc) => remapLocation(loc, changes))
      const keys = remapKeySet(state.selection.keys, changes)
      const clipPaths = state.clipboard
        ? state.clipboard.paths
            .map((p) => applyPathChanges(p, changes))
            .filter((p): p is string => p !== null)
        : []
      const renameKey = state.rename ? remapKey(state.rename.key, changes) : null
      return {
        ...state,
        history,
        selection: {
          keys,
          anchor: remapKey(state.selection.anchor, changes),
          focus: remapKey(state.selection.focus, changes),
        },
        expanded: remapKeySet(state.expanded, changes),
        clipboard:
          state.clipboard && clipPaths.length > 0
            ? { ...state.clipboard, paths: clipPaths }
            : null,
        rename: state.rename && renameKey ? { ...state.rename, key: renameKey } : null,
        infoKey: remapKey(state.infoKey, changes),
      }
    }

    case "quickLook":
      return { ...state, quickLook: action.open ?? !state.quickLook }
    case "info":
      return { ...state, infoKey: action.key }
  }
}
