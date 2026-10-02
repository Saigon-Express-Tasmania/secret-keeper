import { useFinder } from "@/components/dashboard/finderContext"
import { resolveCommand } from "@/components/dashboard/hooks/useFinderCommands"
import { Button } from "@/components/ui/button"

/** Header strip Finder shows inside the Trash. */
export function TrashBar() {
  const c = useFinder()
  const empty = resolveCommand(c, "file.emptyTrash")
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-mac-separator bg-mac-content px-3 select-none">
      <span className="text-[13px] font-semibold text-mac-label">Trash</span>
      <Button size="sm" variant="outline" disabled={!empty.enabled} onClick={empty.run}>
        Empty
      </Button>
    </div>
  )
}
