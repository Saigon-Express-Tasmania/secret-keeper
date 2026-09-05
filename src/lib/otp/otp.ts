/**
 * HOTP (RFC 4226) and TOTP (RFC 6238) using @noble/hashes.
 */

import { hmac } from "@noble/hashes/hmac.js"
import { sha1 } from "@noble/hashes/legacy.js"
import { sha256, sha512 } from "@noble/hashes/sha2.js"

import type { OtpAlgorithm, OtpDigits, OtpSettings } from "@/lib/account/schema"
import { base32Decode } from "@/lib/otp/base32"

function hashFor(algorithm: OtpAlgorithm) {
  switch (algorithm) {
    case "SHA256":
      return sha256
    case "SHA512":
      return sha512
    default:
      return sha1
  }
}

function counterToBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8)
  let n = Math.floor(counter)
  // Write as big-endian uint64 (JS number is fine for practical HOTP counters)
  for (let i = 7; i >= 0; i--) {
    buf[i] = n & 0xff
    n = Math.floor(n / 256)
  }
  return buf
}

/** Generate an HOTP code for the given counter. */
export function generateHotp(
  secretBytes: Uint8Array,
  counter: number,
  digits: OtpDigits = 6,
  algorithm: OtpAlgorithm = "SHA1"
): string {
  const hash = hashFor(algorithm)
  const mac = hmac(hash, secretBytes, counterToBytes(counter))
  const offset = mac[mac.length - 1]! & 0x0f
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff)
  const mod = 10 ** digits
  const code = binary % mod
  return code.toString().padStart(digits, "0")
}

/** Unix time step for TOTP. */
export function totpCounter(
  periodSeconds: number,
  nowMs: number = Date.now()
): number {
  const period = periodSeconds > 0 ? periodSeconds : 30
  return Math.floor(Math.floor(nowMs / 1000) / period)
}

/** Seconds remaining in the current TOTP window. */
export function totpRemainingSeconds(
  periodSeconds: number,
  nowMs: number = Date.now()
): number {
  const period = periodSeconds > 0 ? periodSeconds : 30
  const elapsed = Math.floor(nowMs / 1000) % period
  return period - elapsed
}

export type OtpCodeResult =
  | { ok: true; code: string; remaining: number | null }
  | { ok: false; error: string }

/** Generate the current code from OTP settings. Never throws. */
export function generateOtpCode(
  otp: OtpSettings,
  nowMs: number = Date.now()
): OtpCodeResult {
  const secret = otp.secret.trim()
  if (!secret) {
    return { ok: false, error: "Enter a Base32 secret to generate codes." }
  }
  let secretBytes: Uint8Array
  try {
    secretBytes = base32Decode(secret)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid Base32 secret.",
    }
  }
  if (secretBytes.length === 0) {
    return { ok: false, error: "Secret decoded to empty key." }
  }

  const digits = otp.digits
  const algorithm = otp.algorithm

  if (otp.type === "hotp") {
    const code = generateHotp(secretBytes, otp.counter, digits, algorithm)
    return { ok: true, code, remaining: null }
  }

  const period = otp.period > 0 ? otp.period : 30
  const counter = totpCounter(period, nowMs)
  const code = generateHotp(secretBytes, counter, digits, algorithm)
  return {
    ok: true,
    code,
    remaining: totpRemainingSeconds(period, nowMs),
  }
}
