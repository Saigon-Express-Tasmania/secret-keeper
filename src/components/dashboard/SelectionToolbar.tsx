import type { ReactNode } from "react"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

type SelectionToolbarProps = {
  count: number
  busy?: boolean
  onDelete: () => void
  /** Soft-delete label (default: Delete). */
  deleteLabel?: string
  children?: ReactNode
}

export function SelectionToolbar({
  count,
  busy = false,
  onDelete,
  deleteLabel = "Delete",
  children,
}: SelectionToolbarProps) {
  if (count === 0) return null

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-2">
      <span className="text-sm text-muted-foreground">
        {count} selected
      </span>
      <div className="ml-auto flex items-center gap-2">
        {children}
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 />
          {deleteLabel}
        </Button>
      </div>
    </div>
  )
}
