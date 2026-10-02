import { useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { masterPasswordProblem } from "@/lib/security/password"
import { describeError } from "@/lib/vault/errors"

type ChangeMasterPasswordDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy?: boolean
  vaultName: string
  onSubmit: (current: string, next: string, revokeDevices: boolean) => Promise<void>
}

export function ChangeMasterPasswordDialog({
  open,
  onOpenChange,
  busy = false,
  vaultName,
  onSubmit,
}: ChangeMasterPasswordDialogProps) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [revokeDevices, setRevokeDevices] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setCurrent("")
      setNext("")
      setConfirm("")
      setRevokeDevices(true)
      setError(null)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const problem = masterPasswordProblem(next, vaultName)
    if (problem) {
      setError(problem)
      return
    }
    if (next === current) {
      setError("New password must be different from the current one.")
      return
    }
    if (next !== confirm) {
      setError("New passwords do not match.")
      return
    }

    try {
      await onSubmit(current, next, revokeDevices)
      onOpenChange(false)
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent showCloseButton={!busy}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Change master password</DialogTitle>
            <DialogDescription>
              Re-wraps the vault keys under the new password and rotates the
              server keys. Other sessions are signed out; this one stays open.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div>
              <Label htmlFor="change-mp-current">Current password</Label>
              <Input
                id="change-mp-current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoFocus
                disabled={busy}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="change-mp-new">New password</Label>
              <Input
                id="change-mp-new"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                disabled={busy}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="change-mp-confirm">Confirm new password</Label>
              <Input
                id="change-mp-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
                required
                className="mt-1.5"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={revokeDevices}
                onChange={(e) => setRevokeDevices(e.target.checked)}
                disabled={busy}
              />
              Also sign out all trusted devices
            </label>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !current || !next || !confirm}
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Change password"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
