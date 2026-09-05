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
import { assertValidName } from "@/lib/vault/fs"

type RenameDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current basename. */
  currentName: string
  busy?: boolean
  onSubmit: (newName: string) => Promise<void>
}

export function RenameDialog({
  open,
  onOpenChange,
  currentName,
  busy = false,
  onSubmit,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setName(currentName)
      setError(null)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const trimmed = name.trim()
    try {
      assertValidName(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid name.")
      return
    }
    if (trimmed === currentName) {
      onOpenChange(false)
      return
    }
    try {
      await onSubmit(trimmed)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent showCloseButton={!busy}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              Enter a new name for this item.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div>
              <Label htmlFor="rename-name">Name</Label>
              <Input
                id="rename-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                disabled={busy}
                required
                className="mt-1.5"
              />
            </div>
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
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Rename"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
