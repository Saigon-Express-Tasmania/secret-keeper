import { Trash2 } from "lucide-react"

import { ItemContextMenuItems } from "@/components/dashboard/ItemContextMenu"
import { NodeIcon } from "@/components/icons/NodeIcon"
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { FsDir } from "@/lib/vault/fs"
import { resolveNodeIcon } from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

import type { ExplorerClipboard } from "@/components/dashboard/ExplorerListing"

type FolderSidebarProps = {
  folders: { name: string; node: FsDir }[]
  activeRoot: string | null
  view: "folder" | "recycle-bin"
  recycleBinCount: number
  onSelectFolder: (name: string) => void
  onSelectRecycleBin: () => void
  clipboard?: ExplorerClipboard
  canPaste?: boolean
  onCut?: (path: string) => void
  onCopy?: (path: string) => void
  onPaste?: (destDir: string) => void
  onRename?: (path: string) => void
  onChangeIcon?: (path: string) => void
}

export function FolderSidebar({
  folders,
  activeRoot,
  view,
  recycleBinCount,
  onSelectFolder,
  onSelectRecycleBin,
  clipboard,
  canPaste = false,
  onCut,
  onCopy,
  onPaste,
  onRename,
  onChangeIcon,
}: FolderSidebarProps) {
  const cutPaths =
    clipboard?.mode === "cut" ? new Set(clipboard.paths) : new Set<string>()

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
            {folders.map(({ name, node }) => {
              const active = view === "folder" && activeRoot === name
              const isCut = cutPaths.has(name)
              return (
                <li key={name}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelectFolder(name)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          active
                            ? "bg-accent font-medium text-accent-foreground"
                            : "hover:bg-accent/60",
                          isCut && "opacity-50"
                        )}
                      >
                        <NodeIcon
                          iconId={resolveNodeIcon(node, name)}
                          kind="folder"
                          size={18}
                        />
                        <span className="truncate">{name}</span>
                      </button>
                    </ContextMenuTrigger>
                    <ItemContextMenuItems
                      canEdit={false}
                      canPaste={canPaste}
                      onCut={() => onCut?.(name)}
                      onCopy={() => onCopy?.(name)}
                      onPaste={() => onPaste?.(name)}
                      onRename={() => onRename?.(name)}
                      onChangeIcon={() => onChangeIcon?.(name)}
                    />
                  </ContextMenu>
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
