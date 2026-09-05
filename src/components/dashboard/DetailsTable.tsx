import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type DetailsSortKey =
  | "name"
  | "modified"
  | "created"
  | "type"
  | "size"
  | "deleted"
  | "username"
  | "password"
  | "otp"

/** Wide explorer grid: checkbox + name + credentials + meta. */
export const CREDENTIAL_LISTING_GRID =
  "grid-cols-[auto_minmax(12rem,2fr)_minmax(13rem,1.4fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_4.5rem_5rem] min-w-[44rem]"

/** Search listing grid (no date created): checkbox + name + credentials + modified + type + size. */
export const CREDENTIAL_SEARCH_GRID =
  "grid-cols-[auto_minmax(12rem,2fr)_minmax(13rem,1.4fr)_minmax(7rem,1fr)_4.5rem_5rem] min-w-[38rem]"

export type SortDir = "asc" | "desc"

export type DetailsColumn = {
  key: DetailsSortKey
  label: string
  /** Tailwind class for the column width / alignment. */
  className?: string
  sortable?: boolean
}

type DetailsTableProps = {
  columns: DetailsColumn[]
  sortKey: DetailsSortKey
  sortDir: SortDir
  onSort: (key: DetailsSortKey) => void
  /** Extra header cell before Name (checkbox column). */
  leadingHeader?: ReactNode
  children: ReactNode
  className?: string
  /** Override default column-count grid (must match row templates). */
  gridClass?: string
}

/**
 * Windows Explorer–style Details header + body shell.
 * Children should be rows using the same grid template.
 */
export function DetailsTable({
  columns,
  sortKey,
  sortDir,
  onSort,
  leadingHeader,
  children,
  className,
  gridClass,
}: DetailsTableProps) {
  const grid = gridClass ?? detailsGridClass(columns.length)
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div
        className={cn(
          "sticky top-0 z-10 grid items-center gap-2 border-b border-emerald-200/70 bg-gradient-to-r from-emerald-100/90 via-teal-50/80 to-sky-100/80 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-emerald-800 uppercase",
          grid
        )}
        role="row"
      >
        {leadingHeader ?? <span className="w-4" />}
        {columns.map((col) => {
          const active = sortKey === col.key
          const sortable = col.sortable !== false
          return (
            <button
              key={col.key}
              type="button"
              disabled={!sortable}
              onClick={() => sortable && onSort(col.key)}
              className={cn(
                "flex min-w-0 items-center gap-1 truncate text-left",
                sortable && "hover:text-emerald-950",
                !sortable && "cursor-default",
                col.className
              )}
            >
              <span className="truncate">{col.label}</span>
              {active ? (
                <span className="text-[10px]" aria-hidden>
                  {sortDir === "asc" ? "▲" : "▼"}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <ul className="divide-y divide-emerald-100/80">{children}</ul>
    </div>
  )
}

export function detailsGridClass(columnCount: number): string {
  if (columnCount === 5) {
    return "grid-cols-[auto_minmax(10rem,2fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_4.5rem_5rem]"
  }
  if (columnCount === 4) {
    return "grid-cols-[auto_minmax(10rem,2fr)_minmax(7rem,1fr)_4.5rem_5rem]"
  }
  if (columnCount === 6) {
    return "grid-cols-[auto_minmax(9rem,2fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_4.5rem_5rem]"
  }
  return "grid-cols-[auto_minmax(10rem,1fr)_minmax(7rem,1fr)_minmax(7rem,1fr)]"
}

export function toggleSort(
  currentKey: DetailsSortKey,
  currentDir: SortDir,
  nextKey: DetailsSortKey
): { key: DetailsSortKey; dir: SortDir } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === "asc" ? "desc" : "asc" }
  }
  if (nextKey === "modified" || nextKey === "created" || nextKey === "deleted") {
    return { key: nextKey, dir: "desc" }
  }
  return { key: nextKey, dir: "asc" }
}

export function compareDetails(
  a: {
    name: string
    kind: "dir" | "file"
    modified?: string
    created?: string
    deleted?: string
    sizeBytes: number
  },
  b: typeof a,
  sortKey: DetailsSortKey,
  sortDir: SortDir
): number {
  if (sortKey === "name" || sortKey === "size") {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1
  }

  let cmp = 0
  switch (sortKey) {
    case "name":
      cmp = a.name.localeCompare(b.name)
      break
    case "modified":
      cmp = (a.modified ?? "").localeCompare(b.modified ?? "")
      break
    case "created":
      cmp = (a.created ?? "").localeCompare(b.created ?? "")
      break
    case "deleted":
      cmp = (a.deleted ?? "").localeCompare(b.deleted ?? "")
      break
    case "type":
      cmp = a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
      break
    case "size":
      cmp = a.sizeBytes - b.sizeBytes
      break
  }
  return sortDir === "asc" ? cmp : -cmp
}

/** Ciphertext byte length for sorting (0 for dirs / bad base64). */
export function fileSizeBytes(ciphertext: string | undefined): number {
  if (!ciphertext) return 0
  try {
    return atob(ciphertext).length
  } catch {
    return 0
  }
}
