import type { ReactNode, SyntheticEvent } from "react"
import { Trash2 } from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { resolveCommand } from "@/components/dashboard/hooks/useFinderCommands"
import { FinderIcon } from "@/components/icons/FinderIcon"
import { Button } from "@/components/ui/button"

/** Keep the view surface from treating Return/Space/clicks as item commands. */
const stop = (e: SyntheticEvent) => e.stopPropagation()

function Message({
  icon,
  title,
  detail,
  children,
}: {
  icon: ReactNode
  title: string
  detail?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 pt-16 text-center select-none">
      <div className="opacity-60">{icon}</div>
      <p className="text-[13px] font-semibold text-mac-label-2">{title}</p>
      {detail ? <p className="max-w-xs text-[12px] text-mac-label-3">{detail}</p> : null}
      {children}
    </div>
  )
}

/**
 * Shown when the listing has no items: an empty folder, the empty Trash, or a
 * search without matches. A new item being named counts as an item. Right-
 * clicks and drops on it still reach the view (background menu, drop here).
 */
export function EmptyState() {
  const c = useFinder()
  const { mode, items } = c.model
  if (items.length > 0) return null
  if (mode === "search") {
    return <p className="pt-16 text-center text-[13px] text-mac-label-3">No Results</p>
  }
  if (mode === "trash") {
    return <Message icon={<Trash2 className="size-12 text-mac-label-3" strokeWidth={1.2} />} title="Trash Is Empty" />
  }
  if (mode !== "folder") return null
  const newAccount = resolveCommand(c, "file.newAccount")
  const newFolder = resolveCommand(c, "file.newFolder")
  return (
    <Message
      icon={<FinderIcon kind="folder" size={64} />}
      title="This Folder Is Empty"
      detail="Add an account or folder, or drag items here."
    >
      <div
        className="mt-1 flex flex-wrap justify-center gap-2"
        onKeyDown={stop}
        onPointerDown={stop}
        onDoubleClick={stop}
      >
        <Button size="sm" variant="outline" disabled={!newAccount.enabled} onClick={newAccount.run}>
          New Account
        </Button>
        <Button size="sm" variant="outline" disabled={!newFolder.enabled} onClick={newFolder.run}>
          New Folder
        </Button>
      </div>
    </Message>
  )
}
