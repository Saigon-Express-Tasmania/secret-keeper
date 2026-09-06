import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"

export type ItemContextActions = {
  canEdit?: boolean
  canPaste: boolean
  onEdit?: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onRename: () => void
  onChangeIcon: () => void
  onDelete: () => void
}

/** Menu items for a vault file/folder context menu. */
export function ItemContextMenuItems({
  canEdit = false,
  canPaste,
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
  onPaste,
}: {
  canPaste: boolean
  onPaste: () => void
}) {
  return (
    <ContextMenuContent>
      <ContextMenuItem onSelect={onPaste} disabled={!canPaste}>
        Paste
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
