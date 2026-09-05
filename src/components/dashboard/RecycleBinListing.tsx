import { FileJson, Folder } from "lucide-react"

import type { RecycleBinEntry } from "@/lib/vault/fs"
import { pathBasename } from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

type RecycleBinListingProps = {
  entries: RecycleBinEntry[]
  selected: Set<string>
  onToggle: (id: string) => void
}

export function RecycleBinListing({
  entries,
  selected,
  onToggle,
}: RecycleBinListingProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Recycle Bin is empty.
      </div>
    )
  }

  return (
    <ul className="divide-y">
      {entries.map((entry) => {
        const isDir = entry.node.type === "dir"
        const name = pathBasename(entry.originalPath)
        const checked = selected.has(entry.id)
        const deletedLabel = (() => {
          try {
            return new Date(entry.deletedAt).toLocaleString()
          } catch {
            return entry.deletedAt
          }
        })()

        return (
          <li key={entry.id}>
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
                onChange={() => onToggle(entry.id)}
                aria-label={`Select ${name}`}
              />
              {isDir ? (
                <Folder className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileJson className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {entry.originalPath}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <div>{isDir ? "Folder" : "JSON"}</div>
                <div>{deletedLabel}</div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
