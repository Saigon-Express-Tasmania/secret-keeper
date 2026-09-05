import { useMemo, useState } from "react"

import {
  DetailsTable,
  compareDetails,
  fileSizeBytes,
  toggleSort,
  type DetailsSortKey,
  type SortDir,
} from "@/components/dashboard/DetailsTable"
import { NodeIcon } from "@/components/icons/NodeIcon"
import type { RecycleBinEntry } from "@/lib/vault/fs"
import {
  formatNodeDate,
  formatNodeSize,
  nodeTypeLabel,
  pathBasename,
  resolveNodeIcon,
} from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

type RecycleBinListingProps = {
  entries: RecycleBinEntry[]
  selected: Set<string>
  onToggle: (id: string) => void
}

const COLUMNS = [
  { key: "name" as const, label: "Name" },
  { key: "deleted" as const, label: "Date deleted" },
  { key: "modified" as const, label: "Date modified" },
  { key: "type" as const, label: "Type" },
  { key: "size" as const, label: "Size" },
]

export function RecycleBinListing({
  entries,
  selected,
  onToggle,
}: RecycleBinListingProps) {
  const [sortKey, setSortKey] = useState<DetailsSortKey>("deleted")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const nameA = pathBasename(a.originalPath)
      const nameB = pathBasename(b.originalPath)
      return compareDetails(
        {
          name: nameA,
          kind: a.node.type === "dir" ? "dir" : "file",
          modified: a.node.modifiedAt,
          created: a.node.createdAt,
          deleted: a.deletedAt,
          sizeBytes:
            a.node.type === "file"
              ? fileSizeBytes(a.node.ciphertext)
              : Object.keys(a.node.entries).length,
        },
        {
          name: nameB,
          kind: b.node.type === "dir" ? "dir" : "file",
          modified: b.node.modifiedAt,
          created: b.node.createdAt,
          deleted: b.deletedAt,
          sizeBytes:
            b.node.type === "file"
              ? fileSizeBytes(b.node.ciphertext)
              : Object.keys(b.node.entries).length,
        },
        sortKey,
        sortDir
      )
    })
  }, [entries, sortKey, sortDir])

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Recycle Bin is empty.
      </div>
    )
  }

  return (
    <DetailsTable
      columns={COLUMNS}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={(key) => {
        const next = toggleSort(sortKey, sortDir, key)
        setSortKey(next.key)
        setSortDir(next.dir)
      }}
      leadingHeader={<span className="size-4" aria-hidden />}
    >
      {sorted.map((entry) => {
        const isDir = entry.node.type === "dir"
        const name = pathBasename(entry.originalPath)
        const checked = selected.has(entry.id)
        const iconId = resolveNodeIcon(entry.node, name)

        return (
          <li key={entry.id}>
            <div
              className={cn(
                "grid items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent/50",
                "grid-cols-[auto_minmax(10rem,2fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_4.5rem_5rem]",
                checked && "bg-accent/30"
              )}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 rounded border-input"
                checked={checked}
                onChange={() => onToggle(entry.id)}
                aria-label={`Select ${name}`}
              />
              <div className="flex min-w-0 items-center gap-2">
                <NodeIcon
                  iconId={iconId}
                  kind={isDir ? "folder" : "file"}
                  size={20}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {entry.originalPath}
                  </div>
                </div>
              </div>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {formatNodeDate(entry.deletedAt)}
              </span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {formatNodeDate(entry.node.modifiedAt)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {nodeTypeLabel(entry.node)}
              </span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {formatNodeSize(entry.node)}
              </span>
            </div>
          </li>
        )
      })}
    </DetailsTable>
  )
}
