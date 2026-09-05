import { useEffect, useState } from "react"
import { ChevronRight, Loader2 } from "lucide-react"

import { CopyButton } from "@/components/editor/CopyButton"
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
import { cn } from "@/lib/utils"

type OtpPanelProps = {
  otp: OtpSettings | null
  onChange: (otp: OtpSettings | null) => void
  /** HOTP next-code: parent increments counter and saves immediately. */
  onHotpNext: () => Promise<void>
  hotpBusy?: boolean
}

export function OtpPanel({
  otp,
  onChange,
  onHotpNext,
  hotpBusy,
}: OtpPanelProps) {
  const mode: "off" | OtpType = otp?.type ?? "off"
  const [tick, setTick] = useState(() => Date.now())

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

  const result = otp ? generateOtpCode(otp, tick) : null
  const period = otp?.period && otp.period > 0 ? otp.period : 30
  const remaining = result?.ok ? result.remaining : null
  const progress =
    remaining !== null && otp?.type === "totp"
      ? remaining / period
      : 0

  return (
    <div className="space-y-4">
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
          <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-100/80 to-fuchsia-50 p-4 dark:border-violet-800 dark:from-violet-950/50 dark:to-fuchsia-950/30">
            {result?.ok ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-violet-700 uppercase dark:text-violet-300">
                      Current code
                    </p>
                    <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] text-violet-950 tabular-nums dark:text-violet-50">
                      {result.code}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyButton value={result.code} label="Copy code" />
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
                    <div className="h-2 overflow-hidden rounded-full bg-violet-200/80 dark:bg-violet-900">
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

          <SecretField
            id="otp-secret"
            label="Secret (Base32 or paste otpauth:// URI)"
            value={otp.secret}
            onChange={handleSecretChange}
            placeholder="JBSWY3DPEHPK3PXP"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
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
              <div className="space-y-1.5">
                <Label htmlFor="otp-period">Period (seconds)</Label>
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
              <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="otp-issuer">Issuer</Label>
              <Input
                id="otp-issuer"
                value={otp.issuer}
                onChange={(e) => patch({ issuer: e.target.value })}
                placeholder="GitHub"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="otp-label">Account label</Label>
              <Input
                id="otp-label"
                value={otp.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="you@example.com"
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
