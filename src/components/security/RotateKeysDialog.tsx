import { useState } from "react"

import { StepUpDialog } from "@/components/security/StepUpDialog"

type RotateKeysDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Throw to show an error; the new Emergency Kit is shown by the caller. */
  onRotate: (password: string, revokeDevices: boolean) => Promise<void>
}

/** Replace every key after a suspected compromise of a device or a kit. */
export function RotateKeysDialog({ open, onOpenChange, onRotate }: RotateKeysDialogProps) {
  const [revokeDevices, setRevokeDevices] = useState(true)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setRevokeDevices(true)
  }

  return (
    <StepUpDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rotate all keys"
      description="Replaces the vault key, file key, Secret Key, Recovery Key and server keys, and re-encrypts every file. Other sessions end. Copies made before only open with your old Recovery Key. Passkeys stay enrolled."
      confirmLabel="Rotate"
      onConfirm={(password) => onRotate(password, revokeDevices)}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={revokeDevices}
          onChange={(e) => setRevokeDevices(e.target.checked)}
        />
        Also sign out all trusted devices
      </label>
    </StepUpDialog>
  )
}
