import { Eye, LayoutGrid, List } from "lucide-react"

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import type { ListingViewMode } from "@/lib/prefs/listingView"

/** Listing view mode switch shown as a View submenu when provided. */
export type ListingViewControl = {
  mode: ListingViewMode
  onChange: (mode: ListingViewMode) => void
}

export type ItemContextActions = {
  canEdit?: boolean
  canPaste: boolean
  view?: ListingViewControl
  onEdit?: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onRename: () => void
  onChangeIcon: () => void
  onDelete: () => void
}

/** View → Grid / List submenu followed by a separator. */
function ViewSubmenu({ view }: { view: ListingViewControl }) {
  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Eye />
          View
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup
            value={view.mode}
            onValueChange={(value) => view.onChange(value as ListingViewMode)}
          >
            <ContextMenuRadioItem value="grid">
              <LayoutGrid />
              Grid
            </ContextMenuRadioItem>
            <ContextMenuRadioItem value="list">
              <List />
              List
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
    </>
  )
}

/** Menu items for a vault file/folder context menu. */
export function ItemContextMenuItems({
  canEdit = false,
  canPaste,
  view,
  onEdit,
  onCut,
  onCopy,
  onPaste,
  onRename,
  onChangeIcon,
  onDelete,
}: ItemContextActions) {
  return (
    <ContextMenuContent>
      {view ? <ViewSubmenu view={view} /> : null}
      {canEdit ? (
        <>
          <ContextMenuItem onSelect={() => onEdit?.()}>Edit</ContextMenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      <ContextMenuItem onSelect={onCut}>Cut</ContextMenuItem>
      <ContextMenuItem onSelect={onCopy}>Copy</ContextMenuItem>
      <ContextMenuItem onSelect={onPaste} disabled={!canPaste}>
        Paste
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
      <ContextMenuItem onSelect={onChangeIcon}>Change Icon</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        onSelect={onDelete}
      >
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

/** Paste-only menu for empty folder / listing background. */
export function PasteOnlyMenuItems({
  canPaste,
  view,
  onPaste,
}: {
  canPaste: boolean
  view?: ListingViewControl
  onPaste: () => void
}) {
  return (
    <ContextMenuContent>
      {view ? <ViewSubmenu view={view} /> : null}
      <ContextMenuItem onSelect={onPaste} disabled={!canPaste}>
        Paste
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
