import { FileJson, Folder } from "lucide-react"

import type { SearchHit } from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

type SearchResultsProps = {
  hits: SearchHit[]
  query: string
  selected: Set<string>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}

export function SearchResults({
  hits,
  query,
  selected,
  onToggle,
  onOpen,
}: SearchResultsProps) {
  if (hits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        No matches for “{query}”.
      </div>
    )
  }

  return (
    <ul className="divide-y">
      {hits.map((hit) => {
        const checked = selected.has(hit.path)
        return (
          <li key={hit.path}>
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
                onChange={() => onToggle(hit.path)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${hit.name}`}
              />
              <button
                type="button"
                onClick={() => onOpen(hit.path)}
                className="flex min-w-0 flex-1 items-center gap-3 py-0.5 text-left"
              >
                {hit.kind === "dir" ? (
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileJson className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{hit.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {hit.path}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {hit.match === "name" ? "name" : "folder"}
                </span>
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
