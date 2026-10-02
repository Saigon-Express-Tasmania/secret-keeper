import { useState, type FormEvent } from "react"
import { Fingerprint, Loader2 } from "lucide-react"

import { Field, FormError } from "@/components/gate/GateParts"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deviceLabel } from "@/lib/device/label"
import { describeError } from "@/lib/vault/errors"
import type { PasskeyEnrollment } from "@/lib/vault/vaultSession"
import { discardPasskey, enrollPasskey } from "@/lib/webauthn/prf"

type PasskeyAddDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  vaultName: string
  /** Credential ids already on the vault (the browser refuses duplicates). */
  existing: string[]
  /** Check the master password before any passkey is created. */
  onVerify: (password: string) => Promise<void>
  /** Store the passkey (a re-key confirmed with the same password). */
  onAdd: (enrollment: PasskeyEnrollment, password: string) => Promise<void>
}

/**
 * Two steps: name + master password (checked first, so a typo never leaves
 * an orphan passkey behind), then a separate click that starts WebAuthn,
 * which browsers only allow from a user gesture.
 */
export function PasskeyAddDialog({
  open,
  onOpenChange,
  vaultName,
  existing,
  onVerify,
  onAdd,
}: PasskeyAddDialogProps) {
  const [stage, setStage] = useState<"details" | "touch">("details")
  const [label, setLabel] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setStage("details")
    setLabel(open ? deviceLabel() : "")
    setPassword("")
    setError(null)
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onVerify(password)
      setStage("touch")
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    setBusy(true)
    setError(null)
    let enrollment: PasskeyEnrollment | null = null
    try {
      enrollment = await enrollPasskey({ vaultName, label: label.trim() || "Passkey", exclude: existing })
      await onAdd(enrollment, password)
      setPassword("")
      onOpenChange(false)
    } catch (err) {
      if (enrollment) discardPasskey(enrollment.id)
      setError(describeError(err))
    } finally {
      enrollment?.prfOutput.fill(0)
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent showCloseButton={!busy}>
        <form onSubmit={verify} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a passkey</DialogTitle>
            <DialogDescription>
              A passkey on this device, your phone, or a FIDO2 security key. It must support
              the PRF extension (recent Chrome, Edge, Safari or Firefox).
            </DialogDescription>
          </DialogHeader>
          {stage === "details" ? (
            <>
              <Field
                id="passkey-label"
                label="Name"
                value={label}
                onChange={setLabel}
                placeholder="YubiKey, MacBook…"
                disabled={busy}
                required
              />
              <Field
                id="passkey-password"
                label="Master password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
                autoFocus
                disabled={busy}
                required
              />
            </>
          ) : (
            <p className="text-sm">
              Password confirmed. Click below and follow your browser: it may ask for a touch
              twice.
            </p>
          )}
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {stage === "details" ? (
              <Button type="submit" disabled={busy || !password || !label.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Continue
              </Button>
            ) : (
              <Button type="button" disabled={busy} onClick={() => void create()}>
                {busy ? <Loader2 className="animate-spin" /> : <Fingerprint />}
                Create passkey
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
