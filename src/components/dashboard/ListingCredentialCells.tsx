import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

import { SecretCell, UsernameCell } from "@/components/dashboard/SecretCell"
import type { AccountEntry } from "@/lib/account/schema"
import { generateOtpCode } from "@/lib/otp/otp"

export const DECRYPT_LISTING_NOTICE =
  "Decrypt listing to show title, username, password, and OTP"

function CredRow({
  label,
  tone,
  children,
}: {
  label: string
  tone: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={`w-8 shrink-0 text-[10px] font-semibold tracking-wide uppercase ${tone}`}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function OtpListingCell({
  account,
  tick,
  loading,
}: {
  account: AccountEntry | null
  tick: number
  loading?: boolean
}) {
  if (loading) {
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
  }
  if (!account?.otp) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const result = generateOtpCode(account.otp, tick)
  if (!result.ok) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return <SecretCell value={result.code} maskedPlaceholder="••••••" />
}

/** Username, password, and OTP stacked in a single listing column. */
export function CredentialStackCell({
  account,
  tick,
  loading,
  available,
}: {
  account: AccountEntry | null
  tick: number
  loading?: boolean
  /** False for folders or when listing decrypt is off. */
  available: boolean
}) {
  if (!available) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  if (loading) {
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <CredRow label="User" tone="text-sky-700">
        <UsernameCell value={account?.username ?? ""} />
      </CredRow>
      <CredRow label="Pass" tone="text-amber-700">
        <SecretCell value={account?.password ?? ""} />
      </CredRow>
      <CredRow label="OTP" tone="text-violet-700">
        <OtpListingCell account={account} tick={tick} />
      </CredRow>
    </div>
  )
}
