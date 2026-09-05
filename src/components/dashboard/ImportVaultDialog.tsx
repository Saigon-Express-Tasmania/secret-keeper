import { useState, type ChangeEvent, type FormEvent } from "react"
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

type ImportVaultDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy?: boolean
  onSubmit: (blob: Uint8Array, password: string) => Promise<void>
}

export function ImportVaultDialog({
  open,
  onOpenChange,
  busy = false,
  onSubmit,
}: ImportVaultDialogProps) {
  const [fileInputKey, setFileInputKey] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setFileName(null)
      setFileBytes(null)
      setPassword("")
      setError(null)
      setFileInputKey((k) => k + 1)
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = event.target.files?.[0]
    if (!file) {
      setFileName(null)
      setFileBytes(null)
      return
    }
    try {
      const buffer = await file.arrayBuffer()
      setFileBytes(new Uint8Array(buffer))
      setFileName(file.name)
    } catch {
      setFileName(null)
      setFileBytes(null)
      setError("Failed to read the selected file.")
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!fileBytes || fileBytes.length === 0) {
      setError("Choose an encrypted vault file to import.")
      return
    }
    if (!password) {
      setError("Enter the password used when the file was exported.")
      return
    }

    try {
      await onSubmit(fileBytes, password)
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import vault."
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent showCloseButton={!busy}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Import encrypted vault</DialogTitle>
            <DialogDescription>
              Decrypt a previously exported Keep backup and place its contents
              in a new isolated folder. Existing files are not overwritten.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div>
              <Label htmlFor="import-vault-file">Encrypted file (.ckv)</Label>
              <Input
                key={fileInputKey}
                id="import-vault-file"
                type="file"
                accept=".ckv,application/octet-stream"
                onChange={handleFileChange}
                disabled={busy}
                className="mt-1.5 cursor-pointer"
              />
              {fileName ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Selected: {fileName}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="import-vault-password">
                Export password
              </Label>
              <Input
                id="import-vault-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                required
                className="mt-1.5"
                placeholder="Password used when exporting"
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
            <Button
              type="submit"
              disabled={busy || !fileBytes || !password}
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" />
                  Importing…
                </>
              ) : (
                "Import"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
