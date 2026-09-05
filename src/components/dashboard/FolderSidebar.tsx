import { Folder, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

type FolderSidebarProps = {
  folders: string[]
  activeRoot: string | null
  view: "folder" | "recycle-bin"
  recycleBinCount: number
  onSelectFolder: (name: string) => void
  onSelectRecycleBin: () => void
}

export function FolderSidebar({
  folders,
  activeRoot,
  view,
  recycleBinCount,
  onSelectFolder,
  onSelectRecycleBin,
}: FolderSidebarProps) {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-muted/30">
      <div className="border-b px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Folders
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {folders.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No folders yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {folders.map((name) => {
              const active = view === "folder" && activeRoot === name
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => onSelectFolder(name)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "hover:bg-accent/60"
                    )}
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="border-t p-2">
        <button
          type="button"
          onClick={onSelectRecycleBin}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            view === "recycle-bin"
              ? "bg-accent font-medium text-accent-foreground"
              : "hover:bg-accent/60"
          )}
        >
          <Trash2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">Recycle Bin</span>
          {recycleBinCount > 0 ? (
            <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              {recycleBinCount}
            </span>
          ) : null}
        </button>
      </div>
    </aside>
  )
}
