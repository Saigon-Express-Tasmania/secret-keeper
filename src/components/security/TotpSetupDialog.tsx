import { useEffect, useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"

import { CopyButton } from "@/components/editor/CopyButton"
import { Field, FormError, TrustDeviceCheckbox } from "@/components/gate/GateParts"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createEmptyOtp } from "@/lib/account/schema"
import { base32Encode } from "@/lib/otp/base32"
import { buildOtpauthUri } from "@/lib/otp/otpauth"
import { encodeQrPng } from "@/lib/otp/qr"
import { describeError } from "@/lib/vault/errors"
import { randomBytes } from "@/shared/bytes"

/** RFC 6238 recommends a 160-bit secret; the server refuses shorter ones. */
const TOTP_SECRET_BYTES = 20
const ISSUER = "Credentials Keep"

type TotpSetupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  vaultName: string
  /** Throw to show an error; resolves once two-step verification is on. */
  onEnable: (input: { secret: string; code: string; password: string; trust: boolean }) => Promise<void>
}

/** "ABCDEFGH…" → "ABCD EFGH …" for typing into an app by hand. */
function groupKey(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim()
}

/**
 * Enroll an authenticator app: the secret is made here, shown once as a
 * QR code, and proven with a code before the server stores it.
 */
export function TotpSetupDialog({ open, onOpenChange, vaultName, onEnable }: TotpSetupDialogProps) {
  const [secret, setSecret] = useState("")
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrFailed, setQrFailed] = useState(false)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [trust, setTrust] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A fresh secret every time the dialog opens; nothing survives a close.
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setSecret(open ? base32Encode(randomBytes(TOTP_SECRET_BYTES)) : "")
    setQrUrl(null)
    setQrFailed(false)
    setCode("")
    setPassword("")
    setTrust(true)
    setError(null)
  }

  const uri = secret
    ? buildOtpauthUri({ ...createEmptyOtp("totp"), secret, issuer: ISSUER, label: vaultName })
    : ""

  useEffect(() => {
    if (!uri) return
    let cancelled = false
    let url: string | null = null
    encodeQrPng(uri, 384).then(
      (blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setQrUrl(url)
      },
      () => {
        if (!cancelled) setQrFailed(true)
      }
    )
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [uri])

  const cleanCode = code.replace(/\s/g, "")

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onEnable({ secret, code: cleanCode, password, trust })
      onOpenChange(false)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent showCloseButton={!busy} className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Set up an authenticator app</DialogTitle>
            <DialogDescription>
              Scan the code with Google Authenticator, Microsoft Authenticator, Authy,
              1Password or any TOTP app, then enter the 6-digit code it shows.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-2">
            <div className="flex size-48 items-center justify-center rounded-xl border bg-white p-2 shadow-sm">
              {qrUrl ? (
                <img src={qrUrl} alt="QR code for your authenticator app" className="size-full" />
              ) : qrFailed ? (
                <p className="px-4 text-center text-xs text-destructive">
                  Couldn't draw the QR code. Enter the key below instead.
                </p>
              ) : (
                <Loader2 className="size-6 animate-spin text-neutral-400" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Can't scan? Enter this key in the app:</p>
            <code className="rounded bg-muted px-2 py-1 text-center font-mono text-xs break-all">
              {groupKey(secret)}
            </code>
            <CopyButton value={secret} label="Copy key" />
          </div>

          <Field
            id="totp-setup-code"
            label="Code from the app"
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
            placeholder="123456"
            mono
            disabled={busy}
            required
          />
          <Field
            id="totp-setup-password"
            label="Master password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            disabled={busy}
            required
          />
          <TrustDeviceCheckbox checked={trust} onChange={setTrust} disabled={busy} />
          <p className="text-xs text-muted-foreground">
            Every other trusted device will need a code at its next unlock.
          </p>
          <FormError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || cleanCode.length !== 6 || !password || !secret}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Turn on
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
