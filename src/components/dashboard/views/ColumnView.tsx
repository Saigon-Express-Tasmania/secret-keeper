import { useCallback, useEffect, useRef, type KeyboardEvent } from "react"
import { ChevronRight } from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { ItemPreview } from "@/components/dashboard/ItemPreview"
import { ItemsContextMenu } from "@/components/dashboard/views/ItemsContextMenu"
import { RenameField } from "@/components/dashboard/views/RenameField"
import {
  glyphFor,
  iconKind,
  isCut,
} from "@/components/dashboard/views/itemDisplay"
import { domIdFor, useViewSurface } from "@/components/dashboard/views/useViewSurface"
import { FinderIcon } from "@/components/icons/FinderIcon"
import type { FinderItem } from "@/lib/finder/types"
import { parentPath } from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

/**
 * Miller columns from the vault root to the current folder. Selecting a
 * folder opens it in the next column; selecting an account shows a preview.
 */
export function ColumnView() {
  const c = useFinder()
  const { contentRef } = c
  const columns = c.model.columns ?? []
  const focused = c.model.focusedColumn
  const { selection, rename, phantom, clipboard } = c.state
  const scroller = useRef<HTMLDivElement | null>(null)
  const { dispatch } = c

  /** Column selection = location change (no new Back entry per click). */
  const selectItem = useCallback(
    (item: FinderItem) => {
      if (item.source === "phantom") return
      const path = item.kind === "dir" ? item.path : parentPath(item.path)
      dispatch({ type: "navigate", location: { kind: "path", path }, select: [item.key], replace: true })
    },
    [dispatch]
  )

  function onKey(e: KeyboardEvent<HTMLDivElement>, index: number): boolean {
    if (e.shiftKey) return false
    const current = index >= 0 ? c.model.items[index] : undefined
    if (e.key === "ArrowRight") {
      if (current?.kind === "dir") {
        const next = columns[focused + 1]?.items[0]
        if (next) selectItem(next)
      }
      return true
    }
    if (e.key === "ArrowLeft") {
      const col = columns[focused]
      if (col && focused > 0) {
        const parentItem = columns[focused - 1]?.items.find((i) => i.path === col.dir)
        if (parentItem) selectItem(parentItem)
      }
      return true
    }
    return false
  }

  const { emphasized, surfaceProps, dropKey, canDrag } = useViewSurface({
    onKey,
    onSelectItem: selectItem,
  })

  // Keep the deepest column in view, like Finder.
  const last = columns[columns.length - 1]?.dir
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" })
  }, [last, selection.focus])

  const focusItem = selection.focus ? c.model.itemsByKey.get(selection.focus) : undefined
  const preview =
    focusItem && focusItem.kind === "file" && focusItem.source === "vault" && selection.keys.size === 1
      ? focusItem
      : null

  return (
    <ItemsContextMenu>
      <div
        {...surfaceProps}
        ref={(el) => {
          contentRef.current = el
          scroller.current = el
        }}
        role="group"
        aria-label={c.model.title}
        className="flex h-full overflow-x-auto overflow-y-hidden overscroll-contain outline-none"
      >
        {columns.map((col, i) => (
          <div
            key={col.dir || "/"}
            role="listbox"
            aria-label={col.dir ? col.dir.split("/").pop() : c.vaultName}
            data-drop-dir={col.dir}
            className={cn(
              "h-full w-[220px] shrink-0 overflow-y-auto border-r border-mac-separator py-1",
              dropKey === `bg:${col.dir}` && "shadow-[inset_0_0_0_2px_var(--mac-accent)]"
            )}
          >
            {col.items.map((item) => {
              const selected = selection.keys.has(item.key)
              const onPath = !selected && columns[i + 1]?.dir === item.path
              const active = selected && i === focused && emphasized
              const isPhantom = item.source === "phantom"
              const editing = isPhantom || rename?.key === item.key
              return (
                <div
                  key={item.key}
                  role="option"
                  id={domIdFor(item.key)}
                  aria-selected={selected}
                  data-item-key={item.key}
                  draggable={canDrag && item.source === "vault" && !editing}
                  className={cn(
                    "mx-1.5 flex h-6 items-center gap-1.5 rounded-[5px] px-1.5 text-[13px] select-none pointer-coarse:h-10",
                    dropKey === item.key && "bg-mac-accent/15 shadow-[inset_0_0_0_2px_var(--mac-accent)]",
                    active && "bg-mac-selection text-white",
                    (selected && !active) || onPath ? "bg-mac-selection-inactive" : null,
                    (c.mutations.pendingKeys.has(item.key) || isCut(clipboard, item)) && "opacity-50"
                  )}
                >
                  <FinderIcon kind={iconKind(item)} glyphId={glyphFor(item)} size={16} />
                  {editing ? (
                    <RenameField
                      className="flex-1"
                      initialName={item.name}
                      isFile={item.kind === "file"}
                      saving={isPhantom ? !!phantom?.saving : !!rename?.saving}
                      onCommit={(name) => (isPhantom ? c.commitNew(name) : c.commitRename(item, name))}
                      onCancel={() => (isPhantom ? c.cancelNew() : c.dispatch({ type: "renameEnd" }))}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate" title={item.name}>
                      {item.name}
                    </span>
                  )}
                  {item.kind === "dir" ? (
                    <ChevronRight
                      className={cn("size-3 shrink-0", active ? "text-white/90" : "text-mac-label-3")}
                      strokeWidth={2.5}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        ))}
        {preview ? (
          <div className="h-full w-[300px] shrink-0 overflow-y-auto border-r border-mac-separator">
            <ItemPreview item={preview} variant="column" />
          </div>
        ) : null}
        <div className="min-w-4 flex-1" />
      </div>
    </ItemsContextMenu>
  )
}
