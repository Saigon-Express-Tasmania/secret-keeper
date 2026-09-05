import { FileJson, Folder } from "lucide-react"

import type { FsNode } from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

type Entry = { name: string; node: FsNode }

type ExplorerListingProps = {
  entries: Entry[]
  /** Full path for each entry (parent/name). */
  pathFor: (name: string) => string
  selected: Set<string>
  onToggle: (path: string) => void
  onOpen: (name: string, node: FsNode) => void
}

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.node.type !== b.node.type) {
      return a.node.type === "dir" ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
}

export function ExplorerListing({
  entries,
  pathFor,
  selected,
  onToggle,
  onOpen,
}: ExplorerListingProps) {
  const sorted = sortEntries(entries)

  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        This folder is empty.
      </div>
    )
  }

  return (
    <ul className="divide-y">
      {sorted.map(({ name, node }) => {
        const isDir = node.type === "dir"
        const path = pathFor(name)
        const checked = selected.has(path)
        return (
          <li key={name}>
            <div
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent/50",
                checked && "bg-accent/30"
              )}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 rounded border-input"
                checked={checked}
                onChange={() => onToggle(path)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${name}`}
              />
              <button
                type="button"
                onClick={() => onOpen(name, node)}
                className="flex min-w-0 flex-1 items-center gap-3 py-0.5 text-left"
              >
                {isDir ? (
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileJson className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-medium">{name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {isDir ? "Folder" : "JSON"}
                </span>
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
