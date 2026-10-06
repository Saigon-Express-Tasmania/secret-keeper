import { useState, type ReactNode } from "react"
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react"

import type { ListedAccountState } from "@/components/dashboard/useListedAccounts"
import { useNow } from "@/hooks/useNow"
import { generateOtpCode } from "@/lib/otp/otp"
import { copySecretText } from "@/lib/security/clipboard"
import { cn } from "@/lib/utils"

/** Stop row selection / open when using the inline buttons. */
const stop = {
  onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onDoubleClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
}

function MiniButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      {...stop}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex size-5 shrink-0 items-center justify-center rounded-[4px] opacity-0 transition-opacity group-hover/row:opacity-100 group-aria-selected/row:opacity-100 hover:bg-black/10 focus-visible:opacity-100 pointer-coarse:size-8 pointer-coarse:opacity-100 dark:hover:bg-white/15 [&_svg]:size-3"
    >
      {children}
    </button>
  )
}

function CopyMini({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <MiniButton
      label={copied ? "Copied" : "Copy"}
      onClick={() => {
        void copySecretText(value)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          })
          .catch(() => {})
      }}
    >
      {copied ? <Check /> : <Copy />}
    </MiniButton>
  )
}

const dash = (inverted: boolean) => (
  <span className={inverted ? "text-white/70" : "text-mac-label-3"}>--</span>
)

function pending(state: ListedAccountState | undefined, inverted: boolean): ReactNode | null {
  if (!state || state.status === "idle") return dash(inverted)
  if (state.status === "loading") {
    return <Loader2 className="size-3 animate-spin opacity-60" aria-label="Decrypting" />
  }
  if (state.status === "error") return dash(inverted)
  return null
}

export function UsernameCell({ state, inverted }: { state?: ListedAccountState; inverted: boolean }) {
  const early = pending(state, inverted)
  if (early) return early
  const value = state?.status === "ready" ? state.account.username : ""
  if (!value) return dash(inverted)
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <span className="min-w-0 truncate">{value}</span>
      <CopyMini value={value} />
    </span>
  )
}

export function PasswordCell({ state, inverted }: { state?: ListedAccountState; inverted: boolean }) {
  const [revealed, setRevealed] = useState(false)
  const early = pending(state, inverted)
  if (early) return early
  const value = state?.status === "ready" ? state.account.password : ""
  if (!value) return dash(inverted)
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <span className={cn("min-w-0 truncate font-mono text-[12px]", !revealed && "tracking-wider")}>
        {revealed ? value : "••••••••"}
      </span>
      <MiniButton label={revealed ? "Hide" : "Reveal"} onClick={() => setRevealed((v) => !v)}>
        {revealed ? <EyeOff /> : <Eye />}
      </MiniButton>
      <CopyMini value={value} />
    </span>
  )
}

/** Live one-time code; only this cell re-renders every second. */
export function OtpCell({ state, inverted }: { state?: ListedAccountState; inverted: boolean }) {
  const early = pending(state, inverted)
  const otp = state?.status === "ready" ? state.account.otp : null
  if (early) return early
  if (!otp) return dash(inverted)
  return <OtpCode otp={otp} inverted={inverted} />
}

function OtpCode({
  otp,
  inverted,
}: {
  otp: NonNullable<Extract<ListedAccountState, { status: "ready" }>["account"]["otp"]>
  inverted: boolean
}) {
  const now = useNow(1000)
  const result = generateOtpCode(otp, now)
  if (!result.ok) return dash(inverted)
  const code = result.code.replace(/^(\d{3})(\d+)$/, "$1 $2")
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="font-mono text-[12px] tabular-nums">{code}</span>
      {result.remaining !== null ? (
        <span className={cn("text-[10px] tabular-nums", inverted ? "text-white/70" : "text-mac-label-3")}>
          {result.remaining}s
        </span>
      ) : null}
      <CopyMini value={result.code} />
    </span>
  )
}
