import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react"
import { ChevronRight, ImageUp, Loader2, QrCode } from "lucide-react"

import { CopyButton } from "@/components/editor/CopyButton"
import { OtpQrDialog } from "@/components/editor/OtpQrDialog"
import { SecretField } from "@/components/editor/SecretField"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createEmptyOtp,
  type OtpAlgorithm,
  type OtpDigits,
  type OtpSettings,
  type OtpType,
} from "@/lib/account/schema"
import { generateOtpCode } from "@/lib/otp/otp"
import { tryParseOtpauthOrNull } from "@/lib/otp/otpauth"
import { decodeQrFromImage, firstImageFrom, isImageFile } from "@/lib/otp/qr"
import { cn } from "@/lib/utils"

type QrStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string }

type OtpPanelProps = {
  otp: OtpSettings | null
  onChange: (otp: OtpSettings | null) => void
  /** HOTP next-code: parent increments counter and saves immediately. */
  onHotpNext: () => Promise<void>
  hotpBusy?: boolean
  /** Used in the setup QR code when the OTP issuer / label are blank. */
  fallbackIssuer?: string
  fallbackLabel?: string
}

export function OtpPanel({
  otp,
  onChange,
  onHotpNext,
  hotpBusy,
  fallbackIssuer,
  fallbackLabel,
}: OtpPanelProps) {
  const mode: "off" | OtpType = otp?.type ?? "off"
  const [tick, setTick] = useState(() => Date.now())
  const [qrStatus, setQrStatus] = useState<QrStatus>({ kind: "idle" })
  const [qrOpen, setQrOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!otp || otp.type !== "totp") return
    const id = window.setInterval(() => setTick(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [otp])

  function setMode(next: "off" | OtpType) {
    if (next === "off") {
      onChange(null)
      return
    }
    if (!otp) {
      onChange(createEmptyOtp(next))
      return
    }
    onChange({ ...otp, type: next })
  }

  function patch(partial: Partial<OtpSettings>) {
    const base = otp ?? createEmptyOtp("totp")
    onChange({ ...base, ...partial })
  }

  function handleSecretChange(value: string) {
    const parsed = tryParseOtpauthOrNull(value)
    if (parsed) {
      onChange(parsed)
      return
    }
    patch({ secret: value })
  }

  async function importImage(file: Blob) {
    setQrStatus({ kind: "busy" })
    let text: string | null
    try {
      text = await decodeQrFromImage(file)
    } catch {
      setQrStatus({ kind: "error", message: "Couldn't read image." })
      return
    }
    if (!text) {
      setQrStatus({ kind: "error", message: "No QR code found in image." })
      return
    }
    if (text.trim().toLowerCase().startsWith("otpauth-migration://")) {
      setQrStatus({
        kind: "error",
        message:
          "Google Authenticator export codes aren't supported; export a single account's QR instead.",
      })
      return
    }
    setQrStatus({ kind: "idle" })
    handleSecretChange(text.trim())
  }

  function handleSecretPaste(e: ClipboardEvent<HTMLInputElement>) {
    const image = firstImageFrom(e.clipboardData)
    if (!image) return
    e.preventDefault()
    void importImage(image)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    setDragging(false)
    const image = firstImageFrom(e.dataTransfer)
    if (image) {
      void importImage(image)
    } else {
      setQrStatus({ kind: "error", message: "Drop an image file." })
    }
  }

  const result = otp ? generateOtpCode(otp, tick) : null
  const period = otp?.period && otp.period > 0 ? otp.period : 30
  const remaining = result?.ok ? result.remaining : null
  const progress =
    remaining !== null && otp?.type === "totp"
      ? remaining / period
      : 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["off", "Off"],
            ["totp", "TOTP"],
            ["hotp", "HOTP"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={mode === value ? "default" : "outline"}
            className={cn(
              mode === value &&
                "bg-violet-700 text-white hover:bg-violet-700/90"
            )}
            onClick={() => setMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {!otp ? (
        <p className="text-sm text-muted-foreground">
          Enable TOTP or HOTP to store authenticator settings and generate
          codes.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-100/80 to-fuchsia-50 p-3 dark:border-violet-800 dark:from-violet-950/50 dark:to-fuchsia-950/30">
            {result?.ok ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-violet-700 uppercase dark:text-violet-300">
                      Current code
                    </p>
                    <p className="mt-0.5 font-mono text-2xl font-semibold tracking-[0.2em] text-violet-950 tabular-nums dark:text-violet-50">
                      {result.code}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyButton value={result.code} label="Copy code" />
                    {otp.type === "totp" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setQrOpen(true)}
                      >
                        <QrCode />
                        Show QR
                      </Button>
                    ) : null}
                    {otp.type === "hotp" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={hotpBusy}
                        onClick={() => void onHotpNext()}
                      >
                        {hotpBusy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <ChevronRight />
                        )}
                        Next code
                      </Button>
                    ) : null}
                  </div>
                </div>
                {otp.type === "totp" && remaining !== null ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-violet-700 dark:text-violet-300">
                      <span>Refreshes in {remaining}s</span>
                      <span>{period}s period</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-violet-200/80 dark:bg-violet-900">
                      <div
                        className="h-full rounded-full bg-violet-600 transition-[width] duration-500 ease-linear dark:bg-violet-400"
                        style={{ width: `${Math.max(0, progress) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-destructive">
                {result?.ok === false ? result.error : "Enter a secret."}
              </p>
            )}
          </div>

          <div
            className="relative space-y-1"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <SecretField
              id="otp-secret"
              label="Secret (Base32, otpauth:// URI, or QR image)"
              value={otp.secret}
              onChange={handleSecretChange}
              onPaste={handleSecretPaste}
              placeholder="JBSWY3DPEHPK3PXP"
              trailing={
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={qrStatus.kind === "busy"}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Load QR image"
                  title="Load QR image"
                >
                  {qrStatus.kind === "busy" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ImageUp />
                  )}
                </Button>
              }
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (!file) return
                if (isImageFile(file)) {
                  void importImage(file)
                } else {
                  setQrStatus({ kind: "error", message: "Pick an image file." })
                }
              }}
            />
            {qrStatus.kind === "error" ? (
              <p className="text-xs text-destructive">{qrStatus.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {qrStatus.kind === "busy"
                  ? "Reading QR code…"
                  : "Paste, drop, or browse a QR code image."}
              </p>
            )}
            {dragging ? (
              <div className="pointer-events-none absolute -inset-2 flex items-center justify-center rounded-lg border-2 border-dashed border-violet-500 bg-violet-50/90 text-sm font-medium text-violet-700 dark:bg-violet-950/90 dark:text-violet-200">
                Drop QR image
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 @xs:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="otp-algo">Algorithm</Label>
              <select
                id="otp-algo"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={otp.algorithm}
                onChange={(e) =>
                  patch({ algorithm: e.target.value as OtpAlgorithm })
                }
              >
                <option value="SHA1">SHA1</option>
                <option value="SHA256">SHA256</option>
                <option value="SHA512">SHA512</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="otp-digits">Digits</Label>
              <select
                id="otp-digits"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={otp.digits}
                onChange={(e) =>
                  patch({
                    digits: Number.parseInt(e.target.value, 10) as OtpDigits,
                  })
                }
              >
                <option value={6}>6</option>
                <option value={7}>7</option>
                <option value={8}>8</option>
              </select>
            </div>
            {otp.type === "totp" ? (
              <div className="space-y-1">
                <Label htmlFor="otp-period">Period (s)</Label>
                <Input
                  id="otp-period"
                  type="number"
                  min={1}
                  max={300}
                  value={otp.period}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10)
                    if (Number.isFinite(n) && n > 0) patch({ period: n })
                  }}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="otp-counter">Counter</Label>
                <Input
                  id="otp-counter"
                  type="number"
                  min={0}
                  value={otp.counter}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10)
                    if (Number.isFinite(n) && n >= 0) {
                      patch({ counter: Math.floor(n) })
                    }
                  }}
                />
              </div>
            )}
          </div>
          <div className="grid gap-3 @md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="otp-issuer">Issuer</Label>
              <Input
                id="otp-issuer"
                value={otp.issuer}
                onChange={(e) => patch({ issuer: e.target.value })}
                placeholder="GitHub"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="otp-label">Account label</Label>
              <Input
                id="otp-label"
                value={otp.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="you@example.com"
              />
            </div>
          </div>

          {otp.type === "totp" ? (
            <OtpQrDialog
              open={qrOpen}
              onOpenChange={setQrOpen}
              otp={{
                ...otp,
                issuer: otp.issuer.trim() || fallbackIssuer?.trim() || "",
                label: otp.label.trim() || fallbackLabel?.trim() || "",
              }}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
