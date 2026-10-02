import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react"
import type { KeyboardEvent } from "react"

import { useFinder } from "@/components/dashboard/finderContext"
import type { FinderController } from "@/components/dashboard/hooks/useFinderController"
import { ItemsContextMenu } from "@/components/dashboard/views/ItemsContextMenu"
import { credentialColumns } from "@/components/dashboard/views/credentialColumns"
import { RenameField } from "@/components/dashboard/views/RenameField"
import { fitColumns, NAME_MIN, type ListColumn } from "@/components/dashboard/views/listColumns"
import {
  glyphFor,
  iconKind,
  isCut,
  sizeText,
} from "@/components/dashboard/views/itemDisplay"
import { domIdFor, useViewSurface } from "@/components/dashboard/views/useViewSurface"
import { FinderIcon } from "@/components/icons/FinderIcon"
import { useElementWidth } from "@/hooks/useElementWidth"
import { formatFinderDate } from "@/lib/finder/format"
import { finderKind, folderItems } from "@/lib/finder/items"
import { nextSort } from "@/lib/finder/sort"
import type { FinderItem, SortKey } from "@/lib/finder/types"
import { cn } from "@/lib/utils"


function whereLabel(c: FinderController, where: string | undefined): string {
  if (where === undefined) return ""
  return where === "" ? c.vaultName : where.split("/").join(" › ")
}

/** Columns for the current mode, before width fitting. */
function candidateColumns(c: FinderController, extra: ListColumn[]): ListColumn[] {
  const text = (
    value: string,
    ctx: { selected: boolean; emphasized: boolean },
    align?: "right"
  ) => (
    <span
      className={cn(
        "block truncate",
        align === "right" && "text-right",
        ctx.selected && ctx.emphasized ? "text-white/85" : "text-mac-label-2"
      )}
    >
      {value}
    </span>
  )
  const cols: ListColumn[] = [...extra]
  if (c.model.mode === "trash") {
    cols.push(
      { id: "where", label: "Original Location", width: 190, priority: 4, render: (i, x) => text(whereLabel(c, i.where), x) },
      { id: "deleted", label: "Date Deleted", width: 172, priority: 5, sort: "deleted", render: (i, x) => text(formatFinderDate(i.deletedAt), x) }
    )
  } else if (c.model.mode === "search") {
    cols.push({ id: "where", label: "Where", width: 190, priority: 4, render: (i, x) => text(whereLabel(c, i.where), x) })
  }
  cols.push({
    id: "modified",
    label: "Date Modified",
    width: 172,
    priority: 5,
    sort: "modified",
    render: (i, x) => text(i.source === "phantom" ? "--" : formatFinderDate(i.node.modifiedAt), x),
  })
  if (c.prefs.showCreated) {
    cols.push({
      id: "created",
      label: "Date Created",
      width: 172,
      priority: 8,
      sort: "created",
      render: (i, x) => text(i.source === "phantom" ? "--" : formatFinderDate(i.node.createdAt), x),
    })
  }
  cols.push(
    { id: "size", label: "Size", width: 88, priority: 7, sort: "size", align: "right", render: (i, x) => text(sizeText(i, c.prefs.calculateSizes), x, "right") },
    { id: "kind", label: "Kind", width: 92, priority: 6, sort: "kind", render: (i, x) => text(finderKind(i.node), x) }
  )
  return cols
}

function toggleExpanded(c: FinderController, item: FinderItem, all: boolean) {
  const open = !item.expanded
  const paths = [item.path]
  if (all) {
    const walk = (dir: string) => {
      for (const child of folderItems(c.archive, dir)) {
        if (child.kind === "dir") {
          paths.push(child.path)
          walk(child.path)
        }
      }
    }
    walk(item.path)
  }
  if (!open) {
    const hidden = [...c.state.selection.keys].some((k) => k.startsWith(`${item.path}/`))
    if (hidden) c.dispatch({ type: "setSelection", keys: [item.key] })
  }
  c.dispatch({ type: "setExpanded", paths, open })
}

export function ListView() {
  const c = useFinder()
  const { contentRef } = c
  const width = useElementWidth(contentRef)
  const { items, mode } = c.model
  const tree = mode === "folder"

  function onKey(e: KeyboardEvent<HTMLDivElement>, index: number): boolean {
    if (!tree || index < 0) return false
    const item = items[index]
    if (!item) return false
    if (e.key === "ArrowRight" && item.expandable) {
      if (!item.expanded || e.altKey) toggleExpanded(c, item, e.altKey)
      else if (items[index + 1] && (items[index + 1]!.depth ?? 0) > (item.depth ?? 0)) {
        c.dispatch({ type: "focusMove", key: items[index + 1]!.key, extend: false, ordered: c.model.orderedKeys })
      }
      return true
    }
    if (e.key === "ArrowLeft") {
      if (item.expandable && item.expanded) {
        toggleExpanded(c, item, e.altKey)
        return true
      }
      const depth = item.depth ?? 0
      if (depth > 0) {
        for (let i = index - 1; i >= 0; i--) {
          if ((items[i]!.depth ?? 0) < depth) {
            c.dispatch({ type: "focusMove", key: items[i]!.key, extend: false, ordered: c.model.orderedKeys })
            return true
          }
        }
      }
      return true
    }
    return false
  }

  const { emphasized, surfaceProps, dropKey, canDrag } = useViewSurface({ onKey })
  // A drop "into the folder containing this row" highlights that folder.
  const dropFolder = dropKey?.startsWith("bg:") ? dropKey.slice(3) : dropKey
  const extraColumns =
    c.showCredentials && (mode === "folder" || mode === "search")
      ? credentialColumns(c.credentials)
      : []
  const columns = fitColumns(candidateColumns(c, extraColumns), width)
  const template = `minmax(${NAME_MIN}px, 1fr) ${columns.map((col) => `${col.width}px`).join(" ")}`
  const { selection, rename, phantom, clipboard } = c.state
  const sort = c.model.sort

  function setSort(key: SortKey) {
    const next = nextSort(sort, key)
    if (mode === "trash") c.setPrefs({ trashSort: next })
    else c.setPrefs({ sort: next })
  }

  function header(label: string, key: SortKey | undefined, align?: "right", first = false) {
    const active = key !== undefined && sort.key === key
    const Arrow = sort.dir === "asc" ? ChevronUp : ChevronDown
    return (
      <div
        key={label}
        role="columnheader"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
        className={cn("flex min-w-0 items-center", !first && "border-l border-mac-separator")}
      >
        <button
          type="button"
          disabled={!key}
          onClick={() => key && setSort(key)}
          className={cn(
            "flex h-5 w-full min-w-0 items-center gap-1 px-1.5 outline-none hover:text-mac-label disabled:hover:text-inherit",
            align === "right" && "flex-row-reverse",
            active && "font-semibold text-mac-label"
          )}
        >
          <span className="truncate">{label}</span>
          {active ? <Arrow className="size-3 shrink-0" strokeWidth={2.5} /> : null}
        </button>
      </div>
    )
  }

  return (
    <ItemsContextMenu>
      <div
        {...surfaceProps}
        ref={contentRef}
        role="treegrid"
        aria-label={c.model.title}
        className={cn(
          "h-full overflow-auto overscroll-contain outline-none",
          dropFolder === c.model.path && "shadow-[inset_0_0_0_2px_var(--mac-accent)]"
        )}
      >
        <div
          role="row"
          className="sticky top-0 z-10 grid h-7 items-center border-b border-mac-separator bg-mac-content/95 px-2.5 text-[11px] text-mac-label-2 backdrop-blur-md select-none"
          style={{ gridTemplateColumns: template }}
        >
          {header("Name", "name", undefined, true)}
          {columns.map((col) => header(col.label, col.sort, col.align))}
        </div>
        {items.length === 0 && mode === "search" ? (
          <p className="pt-16 text-center text-[13px] text-mac-label-3">No Results</p>
        ) : null}
        <div role="rowgroup" className="py-1">
          {items.map((item, index) => {
            const selected = selection.keys.has(item.key)
            const prevSel = index > 0 && selection.keys.has(items[index - 1]!.key)
            const nextSel = index < items.length - 1 && selection.keys.has(items[index + 1]!.key)
            const isPhantom = item.source === "phantom"
            const editing = isPhantom || rename?.key === item.key
            const saving = isPhantom ? !!phantom?.saving : !!rename?.saving
            const ctx = { selected, emphasized }
            return (
              <div
                key={item.key}
                role="row"
                id={domIdFor(item.key)}
                aria-selected={selected}
                aria-level={tree ? (item.depth ?? 0) + 1 : undefined}
                aria-expanded={item.expandable ? !!item.expanded : undefined}
                data-item-key={item.key}
                draggable={canDrag && item.source === "vault" && !editing}
                className={cn(
                  "group/row mx-2.5 grid h-6 items-center rounded-[5px] text-[13px] select-none pointer-coarse:h-10",
                  dropFolder === item.key && "bg-mac-accent/15 shadow-[inset_0_0_0_2px_var(--mac-accent)]",
                  index % 2 === 1 && !selected && "bg-mac-row-alt",
                  selected && (emphasized ? "bg-mac-selection text-white" : "bg-mac-selection-inactive"),
                  selected && prevSel && "rounded-t-none",
                  selected && nextSel && "rounded-b-none",
                  (c.mutations.pendingKeys.has(item.key) || isCut(clipboard, item)) && "opacity-50"
                )}
                style={{ gridTemplateColumns: template }}
              >
                <div
                  role="gridcell"
                  className="flex min-w-0 items-center gap-1.5 px-1.5"
                  style={{ paddingLeft: 6 + (item.depth ?? 0) * 16 }}
                >
                  {tree ? (
                    item.expandable ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={item.expanded ? "Collapse" : "Expand"}
                        onPointerDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpanded(c, item, e.altKey)
                        }}
                        className={cn(
                          "flex size-3.5 shrink-0 items-center justify-center rounded-sm",
                          selected && emphasized ? "text-white/90" : "text-mac-label-2"
                        )}
                      >
                        <ChevronRight
                          className={cn("size-3 transition-transform duration-150", item.expanded && "rotate-90")}
                          strokeWidth={2.75}
                        />
                      </button>
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )
                  ) : null}
                  <FinderIcon kind={iconKind(item)} glyphId={glyphFor(item)} size={16} />
                  {editing ? (
                    <RenameField
                      className="flex-1"
                      initialName={item.name}
                      isFile={item.kind === "file"}
                      saving={saving}
                      onCommit={(name) => (isPhantom ? c.commitNew(name) : c.commitRename(item, name))}
                      onCancel={() => (isPhantom ? c.cancelNew() : c.dispatch({ type: "renameEnd" }))}
                    />
                  ) : (
                    <span className="truncate" title={item.name}>
                      {item.name}
                    </span>
                  )}
                </div>
                {columns.map((col) => (
                  <div key={col.id} role="gridcell" className="min-w-0 px-1.5">
                    {col.render(item, ctx)}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </ItemsContextMenu>
  )
}
