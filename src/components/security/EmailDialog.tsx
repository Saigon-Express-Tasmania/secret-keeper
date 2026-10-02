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

type EmailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Masked address already waiting for its code: the dialog starts there. */
  pending: string | null
  /** Send a code to the address; resolves to the masked address. */
  onSend: (email: string, password: string) => Promise<string>
  onConfirm: (code: string) => Promise<void>
}

/** Set or change the vault's email: address + password, then the mailed code. */
export function EmailDialog({ open, onOpenChange, pending, onSend, onConfirm }: EmailDialogProps) {
  const [stage, setStage] = useState<"address" | "code">("address")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setStage(pending ? "code" : "address")
    setSentTo(pending)
    setEmail("")
    setPassword("")
    setCode("")
    setError(null)
  }

  const cleanCode = code.replace(/\s/g, "")

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (stage === "address") {
        setSentTo(await onSend(email, password))
        setPassword("")
        setCode("")
        setStage("code")
      } else {
        await onConfirm(cleanCode)
        onOpenChange(false)
      }
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
            <DialogTitle>Email address</DialogTitle>
            <DialogDescription>
              Used for sign-in links on new devices and for security alerts. Stored encrypted
              on the server, never in your vault file.
            </DialogDescription>
          </DialogHeader>
          {stage === "address" ? (
            <>
              <Field
                id="email-address"
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                placeholder="you@example.com"
                autoFocus
                disabled={busy}
                required
              />
              <Field
                id="email-password"
                label="Master password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                disabled={busy}
                required
              />
            </>
          ) : (
            <>
              <p className="text-sm">
                We sent a 6-digit code to <span className="font-medium">{sentTo}</span>. It
                expires in 15 minutes.
              </p>
              <Field
                id="email-code"
                label="Code from the email"
                value={code}
                onChange={setCode}
                autoComplete="one-time-code"
                placeholder="123456"
                mono
                autoFocus
                disabled={busy}
                required
              />
              <div>
                <LinkButton onClick={() => setStage("address")} disabled={busy}>
                  Use another address or send a new code
                </LinkButton>
              </div>
            </>
          )}
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || (stage === "address" ? !email || !password : cleanCode.length !== 6)}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {stage === "address" ? "Send code" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
