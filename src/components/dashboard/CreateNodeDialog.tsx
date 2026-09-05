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

type CreateNodeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: "folder" | "file"
  busy?: boolean
  onSubmit: (name: string) => Promise<void>
}

export function CreateNodeDialog({
  open,
  onOpenChange,
  kind,
  busy = false,
  onSubmit,
}: CreateNodeDialogProps) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  // Reset form when dialog opens (derive from open transition)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setName("")
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
    try {
      await onSubmit(trimmed)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create.")
    }
  }

  const title = kind === "folder" ? "New folder" : "New file"
  const description =
    kind === "folder"
      ? "Create a folder in the current directory."
      : "Create a JSON file in the current directory. “.json” is added if missing."

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent showCloseButton={!busy}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="node-name">Name</Label>
            <Input
              id="node-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "folder" ? "work" : "github.json"}
              autoFocus
              disabled={busy}
              required
            />
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
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
