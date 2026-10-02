import { useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"

import { Field, FormError, LinkButton } from "@/components/gate/GateParts"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { describeError } from "@/lib/vault/errors"

export type TotpDisableInput =
  | { kind: "code"; password: string; code: string }
  | { kind: "recovery"; recoveryKey: string }

type TotpDisableDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Throw to show an error. */
  onDisable: (input: TotpDisableInput) => Promise<void>
}

/** Turn off two-step verification: password + current code, or the Recovery Key. */
export function TotpDisableDialog({ open, onOpenChange, onDisable }: TotpDisableDialogProps) {
  const [mode, setMode] = useState<"code" | "recovery">("code")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [recoveryKey, setRecoveryKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setMode("code")
    setPassword("")
    setCode("")
    setRecoveryKey("")
    setError(null)
  }

  const cleanCode = code.replace(/\s/g, "")
  const ready = mode === "code" ? cleanCode.length === 6 && password !== "" : recoveryKey.trim() !== ""

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onDisable(
        mode === "code" ? { kind: "code", password, code: cleanCode } : { kind: "recovery", recoveryKey }
      )
      onOpenChange(false)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent showCloseButton={!busy}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Turn off two-step verification</DialogTitle>
            <DialogDescription>
              New devices will then unlock with the master password and Secret Key alone.
            </DialogDescription>
          </DialogHeader>
          {mode === "code" ? (
            <>
              <Field
                id="totp-off-code"
                label="Current code from your authenticator app"
                value={code}
                onChange={setCode}
                autoComplete="one-time-code"
                placeholder="123456"
                mono
                disabled={busy}
                required
              />
              <Field
                id="totp-off-password"
                label="Master password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
                disabled={busy}
                required
              />
              <div>
                <LinkButton onClick={() => setMode("recovery")} disabled={busy}>
                  Lost your phone? Use your Recovery Key
                </LinkButton>
              </div>
            </>
          ) : (
            <>
              <Field
                id="totp-off-recovery"
                label="Recovery Key"
                value={recoveryKey}
                onChange={setRecoveryKey}
                placeholder="RK1-…"
                autoComplete="off"
                mono
                disabled={busy}
                required
              />
              <div>
                <LinkButton onClick={() => setMode("code")} disabled={busy}>
                  Use a code from the app instead
                </LinkButton>
              </div>
            </>
          )}
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || !ready}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Turn off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
