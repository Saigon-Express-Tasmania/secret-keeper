import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react"

import {
  acceptDrag,
  beginDrag,
  endDrag,
  performDrop,
  type DropDest,
} from "@/components/dashboard/dnd"
import { useFinder } from "@/components/dashboard/finderContext"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { parentPath } from "@/lib/vault/fs"
import { resolveCommand } from "@/components/dashboard/hooks/useFinderCommands"
import { nameCollator } from "@/lib/finder/sort"
import { IS_MAC, isEditableTarget } from "@/lib/finder/shortcuts"
import type { FinderItem } from "@/lib/finder/types"

/** DOM id for an item (used by aria-activedescendant). */
export function domIdFor(key: string): string {
  return `fi-${encodeURIComponent(key).replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

function itemKeyFrom(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  const el = target.closest<HTMLElement>("[data-item-key]")
  return el?.dataset.itemKey ?? null
}

type SurfaceOptions = {
  /** Items per row (Icon view) for ↑/↓. */
  rowLength?: number
  /**
   * View-specific keys (List tree ←/→, Column navigation). Return true when
   * handled. `index` is the focus position in `orderedKeys`.
   */
  onKey?: (e: KeyboardEvent<HTMLDivElement>, index: number) => boolean
  /** Replace plain-click selection (Column view navigates on select). */
  onSelectItem?: (item: FinderItem) => void
}

/**
 * Shared Finder view behaviour: one focusable container with delegated
 * pointer handling (click selects, ⌘/Ctrl-click toggles, Shift-click extends,
 * double-click opens), arrow/Home/End navigation, Return to rename, Space for
 * Quick Look and type-to-select.
 */
export function useViewSurface({ rowLength = 1, onKey, onSelectItem }: SurfaceOptions = {}) {
  const c = useFinder()
  const [focusWithin, setFocusWithin] = useState(false)
  /** Key of the folder (or `bg:<dir>`) highlighted as the drop target. */
  const [dropKey, setDropKey] = useState<string | null>(null)
  const finePointer = useMediaQuery("(pointer: fine)")
  const typed = useRef({ text: "", at: 0 })
  const deferredKey = useRef<string | null>(null)
  const touchKey = useRef<string | null>(null)

  const { model, state, dispatch } = c
  const ordered = model.orderedKeys
  const emphasized = c.win.active && (focusWithin || c.win.menuOpen)

  // Like Finder, the content keeps keyboard focus after switching views or
  // navigating from the sidebar/toolbar/path bar (but never steals it from a
  // text field such as the search box).
  const { contentRef } = c
  const locationKey =
    model.location.kind === "trash" ? "trash" : `p:${model.location.path}`
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const active = document.activeElement
    const fromChrome =
      active instanceof HTMLElement &&
      !isEditableTarget(active) &&
      !!active.closest('aside, header, nav[aria-label="Path"]')
    if (!active || active === document.body || fromChrome) {
      el.focus({ preventScroll: true })
    }
  }, [contentRef, locationKey, model.view])

  const selectOne = useCallback(
    (item: FinderItem) => {
      if (onSelectItem) onSelectItem(item)
      else dispatch({ type: "select", key: item.key, mode: "replace", ordered })
    },
    [dispatch, onSelectItem, ordered]
  )

  const moveTo = useCallback(
    (key: string | undefined, extend: boolean) => {
      if (!key) return
      const item = model.itemsByKey.get(key)
      if (!extend && item && onSelectItem) {
        onSelectItem(item)
        return
      }
      dispatch({ type: "focusMove", key, extend, ordered })
    },
    [dispatch, model.itemsByKey, onSelectItem, ordered]
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.defaultPrevented || isEditableTarget(e.target)) return
      if (state.rename || state.phantom) return
      const mod = IS_MAC ? e.metaKey : e.ctrlKey
      if (mod || (IS_MAC && e.ctrlKey)) return
      const focus = state.selection.focus
      const index = focus ? ordered.indexOf(focus) : -1
      if (onKey?.(e, index)) {
        e.preventDefault()
        return
      }
      if (e.altKey) return
      const last = ordered.length - 1
      const extend = e.shiftKey
      let next: string | undefined
      switch (e.key) {
        case "ArrowDown":
          next = index < 0 ? ordered[0] : ordered[Math.min(last, index + rowLength)]
          break
        case "ArrowUp":
          next = index < 0 ? ordered[last] : ordered[Math.max(0, index - rowLength)]
          break
        case "ArrowRight":
          if (rowLength === 1) return
          next = index < 0 ? ordered[0] : ordered[Math.min(last, index + 1)]
          break
        case "ArrowLeft":
          if (rowLength === 1) return
          next = index < 0 ? ordered[0] : ordered[Math.max(0, index - 1)]
          break
        case "Home":
          next = ordered[0]
          break
        case "End":
          next = ordered[last]
          break
        case "PageDown":
          next = ordered[Math.min(last, Math.max(0, index) + rowLength * 8)]
          break
        case "PageUp":
          next = ordered[Math.max(0, index - rowLength * 8)]
          break
        case "Enter":
        case "F2": {
          if (e.key === "F2" && IS_MAC) return
          e.preventDefault()
          resolveCommand(c, "file.rename").run()
          return
        }
        case " ": {
          if (typed.current.text && Date.now() - typed.current.at < 1000) break
          e.preventDefault()
          resolveCommand(c, "file.quickLook").run()
          return
        }
        case "Escape":
          if (state.quickLook) dispatch({ type: "quickLook", open: false })
          else if (state.selection.keys.size > 0) dispatch({ type: "clearSelection" })
          else return
          e.preventDefault()
          return
      }
      if (next !== undefined) {
        e.preventDefault()
        moveTo(next, extend)
        return
      }
      // Type-to-select: jump to the first name starting with what was typed.
      if (e.key.length === 1) {
        const now = Date.now()
        const buf = now - typed.current.at < 1000 ? typed.current.text + e.key : e.key
        typed.current = { text: buf, at: now }
        const match = ordered.find((key) => {
          const name = model.itemsByKey.get(key)?.name ?? ""
          return nameCollator.compare(name.slice(0, buf.length), buf) === 0
        })
        if (match) {
          e.preventDefault()
          moveTo(match, false)
        }
      }
    },
    [c, dispatch, model.itemsByKey, moveTo, onKey, ordered, rowLength, state]
  )

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || isEditableTarget(e.target)) return
      const key = itemKeyFrom(e.target)
      deferredKey.current = null
      touchKey.current = null
      if (!key) {
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey && state.selection.keys.size > 0) {
          dispatch({ type: "clearSelection" })
        }
        return
      }
      const item = model.itemsByKey.get(key)
      if (!item) return
      if (e.pointerType === "touch") {
        touchKey.current = key
        return
      }
      if (IS_MAC && e.ctrlKey) return // macOS Control-click = right-click
      const toggle = IS_MAC ? e.metaKey : e.ctrlKey
      if (toggle) {
        dispatch({ type: "select", key, mode: "toggle", ordered })
      } else if (e.shiftKey) {
        dispatch({ type: "select", key, mode: "range", ordered })
      } else if (!state.selection.keys.has(key)) {
        selectOne(item)
      } else {
        // Keep a multi-selection for dragging; collapse on click instead.
        deferredKey.current = key
      }
    },
    [dispatch, model.itemsByKey, ordered, selectOne, state.selection.keys]
  )

  const onClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (isEditableTarget(e.target)) return
      const key = itemKeyFrom(e.target)
      const item = key ? model.itemsByKey.get(key) : undefined
      if (touchKey.current && item && touchKey.current === key) {
        touchKey.current = null
        if (c.win.selectMode) dispatch({ type: "select", key: item.key, mode: "toggle", ordered })
        else void c.openItem(item)
        return
      }
      if (deferredKey.current && item && deferredKey.current === key) {
        deferredKey.current = null
        if (state.selection.keys.size > 1 || state.selection.focus !== key) selectOne(item)
      }
    },
    [c, dispatch, model.itemsByKey, ordered, selectOne, state.selection]
  )

  const onDoubleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (isEditableTarget(e.target)) return
      const key = itemKeyFrom(e.target)
      const item = key ? model.itemsByKey.get(key) : undefined
      if (item) void c.openItem(item)
    },
    [c, model.itemsByKey]
  )

  /** Folder a drop at this event lands in (null = not a drop target). */
  const dropTargetFor = useCallback(
    (target: EventTarget | null): { dest: DropDest; key: string } | null => {
      if (model.mode === "trash" || model.mode === "file") return null
      const key = itemKeyFrom(target)
      const item = key ? model.itemsByKey.get(key) : undefined
      if (item && item.source === "vault" && item.kind === "dir") {
        return { dest: item.path, key: item.key }
      }
      if (model.mode === "search") return null
      if (item && item.source === "vault") {
        const dir = parentPath(item.path)
        return { dest: dir, key: `bg:${dir}` }
      }
      const column =
        target instanceof Element ? target.closest<HTMLElement>("[data-drop-dir]") : null
      const dir = column?.dataset.dropDir ?? model.path
      return { dest: dir, key: `bg:${dir}` }
    },
    [model]
  )

  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const key = itemKeyFrom(e.target)
      const item = key ? model.itemsByKey.get(key) : undefined
      if (!item || item.source !== "vault" || state.rename || state.phantom) {
        e.preventDefault()
        return
      }
      deferredKey.current = null
      let paths: string[]
      if (state.selection.keys.has(item.key)) {
        paths = model.selectedItems.filter((i) => i.source === "vault").map((i) => i.path)
      } else {
        dispatch({ type: "setSelection", keys: [item.key] })
        paths = [item.path]
      }
      beginDrag(e, paths)
    },
    [dispatch, model, state]
  )

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const target = dropTargetFor(e.target)
      if (!target || !acceptDrag(c, target.dest, e)) {
        setDropKey(null)
        return
      }
      setDropKey(target.key)
    },
    [c, dropTargetFor]
  )

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropKey(null)
  }, [])

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      setDropKey(null)
      const target = dropTargetFor(e.target)
      if (target) performDrop(c, target.dest, e)
    },
    [c, dropTargetFor]
  )

  const onDragEnd = useCallback(() => {
    setDropKey(null)
    endDrag()
  }, [])

  const onFocus = useCallback(() => setFocusWithin(true), [])
  const onBlur = useCallback((e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
  }, [])

  const focus = state.selection.focus
  return {
    emphasized,
    dropKey,
    /** Items may be dragged (mouse/trackpad only; touch has no drag and drop). */
    canDrag: finePointer && !c.busy,
    surfaceProps: {
      onDragStart,
      onDragOver,
      onDragLeave,
      onDrop,
      onDragEnd,
      tabIndex: 0,
      "aria-multiselectable": true,
      "aria-activedescendant": focus && model.itemsByKey.has(focus) ? domIdFor(focus) : undefined,
      onKeyDown,
      onPointerDown,
      onClick,
      onDoubleClick,
      onFocus,
      onBlur,
    },
  }
}
