import { Loader2 } from "lucide-react"

import { SecretCell } from "@/components/dashboard/SecretCell"
import type { AccountEntry } from "@/lib/account/schema"
import { generateOtpCode } from "@/lib/otp/otp"

export const DECRYPT_LISTING_NOTICE =
  "Decrypt listing to show title, username, password, and OTP"

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
