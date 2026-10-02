/**
 * Second factors checked by the server: TOTP codes and email sign-in tokens.
 */

import { generateHotp } from "../src/lib/otp/otp"
import { bytesEqual, utf8 } from "../src/shared/bytes"
import { sha256Base64Url } from "./secrets"

export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6
export const TOTP_SECRET_BYTES = 20

/**
 * Accepts the current 30 s step ±1 (clock drift). Returns the matched step,
 * or null. Steps at or below `lastUsedStep` are refused so a code can only
 * be used once.
 */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  nowSeconds: number,
  lastUsedStep: number
): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const current = Math.floor(nowSeconds / TOTP_PERIOD_SECONDS)
  let matched: number | null = null
  // Check every candidate so timing does not depend on which one matches.
  for (const step of [current - 1, current, current + 1]) {
    const expected = generateHotp(secret, step, TOTP_DIGITS, "SHA1")
    if (bytesEqual(utf8(expected), utf8(code)) && step > lastUsedStep && matched === null) {
      matched = step
    }
  }
  return matched
}

/** Email-link tokens are stored hashed; the raw token only exists in the email. */
export function hashLinkToken(token: Uint8Array): string {
  return sha256Base64Url(token)
}

/** "pat@example.com" → "p•••@example.com" */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@")
  if (at < 1) return "•••"
  return `${address[0]}•••${address.slice(at)}`
}
