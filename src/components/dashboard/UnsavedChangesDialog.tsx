import { Loader2 } from "lucide-react"

import { AppIcon } from "@/components/mac/AppIcon"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

type UnsavedChangesDialogProps = {
  open: boolean
  fileName: string
  busy?: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

/** macOS "Do you want to save the changes…" sheet. */
export function UnsavedChangesDialog({
  open,
  fileName,
  busy = false,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel()
      }}
    >
      <DialogContent showCloseButton={false} className="gap-3 sm:max-w-[26rem]">
        <div className="flex gap-4">
          <AppIcon size={52} />
          <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
            <DialogTitle className="pr-0">
              Do you want to save the changes you made to “{fileName}”?
            </DialogTitle>
            <DialogDescription>
              Your changes will be lost if you don’t save them.
            </DialogDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onDiscard} disabled={busy}>
            Don’t Save
          </Button>
          <div className="flex-1" />
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={busy} autoFocus>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
