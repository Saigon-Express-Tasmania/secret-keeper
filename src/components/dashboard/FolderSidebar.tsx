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
  onDelete?: (path: string) => void
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
  onDelete,
}: FolderSidebarProps) {
  const cutPaths =
    clipboard?.mode === "cut" ? new Set(clipboard.paths) : new Set<string>()

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-emerald-200/70 bg-emerald-50/75 backdrop-blur-md">
      <div className="border-b border-emerald-200/70 bg-gradient-to-r from-emerald-600 to-teal-500 px-3 py-2 text-xs font-semibold tracking-wide text-white uppercase">
        Folders
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {folders.length === 0 ? (
          <p className="px-2 py-3 text-xs text-emerald-800/70">
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
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                          active
                            ? "bg-emerald-600 font-medium text-white shadow-sm shadow-emerald-700/20"
                            : "text-emerald-950 hover:bg-emerald-100/90",
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
                      onDelete={() => onDelete?.(name)}
                    />
                  </ContextMenu>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-emerald-200/70 p-2">
        <button
          type="button"
          onClick={onSelectRecycleBin}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
            view === "recycle-bin"
              ? "bg-rose-600 font-medium text-white shadow-sm shadow-rose-700/20"
              : "text-rose-800 hover:bg-rose-50"
          )}
        >
          <Trash2
            className={cn(
              "size-4 shrink-0",
              view === "recycle-bin" ? "text-white" : "text-rose-500"
            )}
          />
          <span className="truncate">Recycle Bin</span>
          {recycleBinCount > 0 ? (
            <span
              className={cn(
                "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                view === "recycle-bin"
                  ? "bg-white/25 text-white"
                  : "bg-rose-100 text-rose-800"
              )}
            >
              {recycleBinCount}
            </span>
          ) : null}
        </button>
      </div>
    </aside>
  )
}
