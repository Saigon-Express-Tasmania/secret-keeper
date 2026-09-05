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
import {
  formatNodeDate,
  formatNodeSize,
  nodeTypeLabel,
  resolveNodeIcon,
  type FsNode,
} from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

type Entry = { name: string; node: FsNode }

type ExplorerListingProps = {
  entries: Entry[]
  /** Full path for each entry (parent/name). */
  pathFor: (name: string) => string
  selected: Set<string>
  onToggle: (path: string) => void
  onOpen: (name: string, node: FsNode) => void
  onChangeIcon?: (path: string, node: FsNode) => void
}

const COLUMNS = [
  { key: "name" as const, label: "Name" },
  { key: "modified" as const, label: "Date modified" },
  { key: "created" as const, label: "Date created" },
  { key: "type" as const, label: "Type" },
  { key: "size" as const, label: "Size" },
]

export function ExplorerListing({
  entries,
  pathFor,
  selected,
  onToggle,
  onOpen,
  onChangeIcon,
}: ExplorerListingProps) {
  const [sortKey, setSortKey] = useState<DetailsSortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) =>
      compareDetails(
        {
          name: a.name,
          kind: a.node.type === "dir" ? "dir" : "file",
          modified: a.node.modifiedAt,
          created: a.node.createdAt,
          sizeBytes:
            a.node.type === "file"
              ? fileSizeBytes(a.node.ciphertext)
              : Object.keys(a.node.entries).length,
        },
        {
          name: b.name,
          kind: b.node.type === "dir" ? "dir" : "file",
          modified: b.node.modifiedAt,
          created: b.node.createdAt,
          sizeBytes:
            b.node.type === "file"
              ? fileSizeBytes(b.node.ciphertext)
              : Object.keys(b.node.entries).length,
        },
        sortKey,
        sortDir
      )
    )
  }, [entries, sortKey, sortDir])

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        This folder is empty.
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
      {sorted.map(({ name, node }) => {
        const isDir = node.type === "dir"
        const path = pathFor(name)
        const checked = selected.has(path)
        const iconId = resolveNodeIcon(node, name)

        return (
          <li key={name}>
            <div
              className={cn(
                "grid items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent/50",
                "grid-cols-[auto_minmax(10rem,2fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_4.5rem_5rem]",
                checked && "bg-accent/30"
              )}
              onContextMenu={(e) => {
                if (!onChangeIcon) return
                e.preventDefault()
                onChangeIcon(path, node)
              }}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 rounded border-input"
                checked={checked}
                onChange={() => onToggle(path)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${name}`}
              />
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 hover:bg-accent"
                  title="Change icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChangeIcon?.(path, node)
                  }}
                >
                  <NodeIcon
                    iconId={iconId}
                    kind={isDir ? "folder" : "file"}
                    size={20}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(name, node)}
                  className="min-w-0 flex-1 truncate text-left font-medium"
                >
                  {name}
                </button>
              </div>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {formatNodeDate(node.modifiedAt)}
              </span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {formatNodeDate(node.createdAt)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {nodeTypeLabel(node)}
              </span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {formatNodeSize(node)}
              </span>
            </div>
          </li>
        )
      })}
    </DetailsTable>
  )
}
