import { useEffect, useState } from "react"
import { Check, Copy, Download, Loader2 } from "lucide-react"

import { CopyButton } from "@/components/editor/CopyButton"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { OtpSettings } from "@/lib/account/schema"
import { buildOtpauthUri } from "@/lib/otp/otpauth"
import { encodeQrPng } from "@/lib/otp/qr"

type Rendered =
  | { uri: string; ok: true; blob: Blob; url: string }
  | { uri: string; ok: false }

type CopyStatus =
  | { kind: "idle" }
  | { kind: "copied" }
  | { kind: "error"; message: string }

type OtpQrDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Settings to enroll; issuer/label fallbacks already applied. */
  otp: OtpSettings
}

/** e.g. "GitHub", "you@example.com" -> "github-you-example-com-qr.png" */
function qrFilename(otp: OtpSettings): string {
  const slug = `${otp.issuer} ${otp.label}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "")
  return `${slug || "totp"}-qr.png`
}

export function OtpQrDialog({ open, onOpenChange, otp }: OtpQrDialogProps) {
  const [rendered, setRendered] = useState<Rendered | null>(null)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>({ kind: "idle" })

  // Object URLs are revoked on close; drop the stale image when reopening.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setRendered(null)
      setCopyStatus({ kind: "idle" })
    }
  }

  const uri = buildOtpauthUri(otp)
  const current = rendered?.uri === uri ? rendered : null

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let url: string | null = null
    encodeQrPng(uri).then(
      (blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setRendered({ uri, ok: true, blob, url })
      },
      () => {
        if (!cancelled) setRendered({ uri, ok: false })
      }
    )
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [open, uri])

  async function copyImage() {
    if (!current?.ok) return
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      setCopyStatus({
        kind: "error",
        message: "This browser can't copy images. Use Download instead.",
      })
      return
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": current.blob }),
      ])
      setCopyStatus({ kind: "copied" })
      window.setTimeout(
        () =>
          setCopyStatus((s) => (s.kind === "copied" ? { kind: "idle" } : s)),
        1500
      )
    } catch {
      setCopyStatus({
        kind: "error",
        message: "Couldn't copy the image. Use Download instead.",
      })
    }
  }

  function download() {
    if (!current?.ok) return
    const a = document.createElement("a")
    a.href = current.url
    a.download = qrFilename(otp)
    a.click()
  }

  const caption =
    [otp.issuer.trim(), otp.label.trim()].filter(Boolean).join(" · ") ||
    "Account"
  const period = otp.period > 0 ? otp.period : 30
  const nonDefault =
    otp.algorithm !== "SHA1" || otp.digits !== 6 || period !== 30

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up authenticator app</DialogTitle>
          <DialogDescription>
            Scan with Google Authenticator, Microsoft Authenticator, Amazon
            Authenticator, Authy, 1Password, or any TOTP app.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2">
          <div className="flex size-64 items-center justify-center rounded-xl border bg-white p-2 shadow-sm">
            {current?.ok ? (
              <img
                src={current.url}
                alt={`QR code for ${caption}`}
                className="size-full"
              />
            ) : current ? (
              <p className="px-4 text-center text-xs text-destructive">
                Couldn't render QR code.
              </p>
            ) : (
              <Loader2 className="size-6 animate-spin text-neutral-400" />
            )}
          </div>
          <p className="text-sm font-medium break-all">{caption}</p>
        </div>

        {nonDefault ? (
          <p className="text-xs text-muted-foreground">
            Uses {otp.algorithm} · {otp.digits} digits · {period}s. Some apps
            (e.g. Google or Microsoft Authenticator) only support SHA1 · 6
            digits · 30s and may show wrong codes.
          </p>
        ) : null}
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This QR code contains your secret key. Anyone who scans it, or gets
          the downloaded image, can generate your codes.
        </p>
        {copyStatus.kind === "error" ? (
          <p className="text-xs text-destructive">{copyStatus.message}</p>
        ) : null}

        <DialogFooter>
          <CopyButton value={uri} label="Copy link" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!current?.ok}
            onClick={() => void copyImage()}
          >
            {copyStatus.kind === "copied" ? <Check /> : <Copy />}
            {copyStatus.kind === "copied" ? "Copied" : "Copy image"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!current?.ok}
            onClick={download}
          >
            <Download />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
