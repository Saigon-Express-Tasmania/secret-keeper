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
  getNode,
  nodeTypeLabel,
  resolveNodeIcon,
  type SearchHit,
  type VaultArchive,
} from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

type SearchResultsProps = {
  archive: VaultArchive
  hits: SearchHit[]
  query: string
  selected: Set<string>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onChangeIcon?: (path: string) => void
}

const COLUMNS = [
  { key: "name" as const, label: "Name" },
  { key: "modified" as const, label: "Date modified" },
  { key: "type" as const, label: "Type" },
  { key: "size" as const, label: "Size" },
]

export function SearchResults({
  archive,
  hits,
  query,
  selected,
  onToggle,
  onOpen,
  onChangeIcon,
}: SearchResultsProps) {
  const [sortKey, setSortKey] = useState<DetailsSortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const sorted = useMemo(() => {
    return [...hits].sort((a, b) => {
      const nodeA = getNode(archive, a.path)
      const nodeB = getNode(archive, b.path)
      return compareDetails(
        {
          name: a.name,
          kind: a.kind,
          modified: nodeA?.modifiedAt,
          created: nodeA?.createdAt,
          sizeBytes:
            nodeA?.type === "file"
              ? fileSizeBytes(nodeA.ciphertext)
              : nodeA?.type === "dir"
                ? Object.keys(nodeA.entries).length
                : 0,
        },
        {
          name: b.name,
          kind: b.kind,
          modified: nodeB?.modifiedAt,
          created: nodeB?.createdAt,
          sizeBytes:
            nodeB?.type === "file"
              ? fileSizeBytes(nodeB.ciphertext)
              : nodeB?.type === "dir"
                ? Object.keys(nodeB.entries).length
                : 0,
        },
        sortKey,
        sortDir
      )
    })
  }, [hits, archive, sortKey, sortDir])

  if (hits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        No matches for “{query}”.
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
      {sorted.map((hit) => {
        const checked = selected.has(hit.path)
        const node = getNode(archive, hit.path)
        const iconId = node
          ? resolveNodeIcon(node, hit.name)
          : undefined

        return (
          <li key={hit.path}>
            <div
              className={cn(
                "grid items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent/50",
                "grid-cols-[auto_minmax(10rem,2fr)_minmax(7rem,1fr)_4.5rem_5rem]",
                checked && "bg-accent/30"
              )}
              onContextMenu={(e) => {
                if (!onChangeIcon || !node) return
                e.preventDefault()
                onChangeIcon(hit.path)
              }}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 rounded border-input"
                checked={checked}
                onChange={() => onToggle(hit.path)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${hit.name}`}
              />
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 hover:bg-accent"
                  title="Change icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChangeIcon?.(hit.path)
                  }}
                >
                  <NodeIcon
                    iconId={iconId}
                    kind={hit.kind === "dir" ? "folder" : "file"}
                    size={20}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(hit.path)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate font-medium">{hit.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {hit.path}
                  </div>
                </button>
              </div>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {formatNodeDate(node?.modifiedAt)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {node ? nodeTypeLabel(node) : hit.kind === "dir" ? "Folder" : "JSON"}
              </span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {node ? formatNodeSize(node) : "—"}
              </span>
            </div>
          </li>
        )
      })}
    </DetailsTable>
  )
}
