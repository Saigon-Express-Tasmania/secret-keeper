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
import { describeError } from "@/lib/vault/errors"
import { isCkv3 } from "@/shared/ckv3"

type ImportVaultDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy?: boolean
  onSubmit: (blob: Uint8Array, recoveryKey: string | null, intoRoot: boolean) => Promise<void>
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
  const [recoveryKey, setRecoveryKey] = useState("")
  const [intoRoot, setIntoRoot] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setFileName(null)
      setFileBytes(null)
      setRecoveryKey("")
      setIntoRoot(false)
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
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!isCkv3(bytes)) {
        setFileBytes(null)
        setFileName(null)
        setError(
          "This is not a Keep export. Old .ckv exports must be converted first: npm run ck-file -- from-legacy --file <file>."
        )
        return
      }
      setFileBytes(bytes)
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
    if (!fileBytes) {
      setError("Choose an export or import file (.ckx).")
      return
    }
    try {
      await onSubmit(fileBytes, recoveryKey.trim() || null, intoRoot)
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
            <DialogTitle>Import into this vault</DialogTitle>
            <DialogDescription>
              Decrypts a Keep export (or a file made with the ck-file tool) and adds its
              contents. Existing files are never overwritten.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div>
              <Label htmlFor="import-vault-file">File (.ckx)</Label>
              <Input
                key={fileInputKey}
                id="import-vault-file"
                type="file"
                accept=".ckx,application/octet-stream"
                onChange={handleFileChange}
                disabled={busy}
                className="mt-1.5 cursor-pointer"
              />
              {fileName ? (
                <p className="mt-1.5 text-xs text-muted-foreground">Selected: {fileName}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="import-recovery-key">Recovery Key or import key</Label>
              <Input
                id="import-recovery-key"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 font-mono"
                placeholder="RK1-…  (leave empty for this vault's own exports)"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={intoRoot}
                onChange={(e) => setIntoRoot(e.target.checked)}
                disabled={busy}
              />
              Merge into the top level (moving an old vault here) instead of a new folder
            </label>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !fileBytes}>
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
