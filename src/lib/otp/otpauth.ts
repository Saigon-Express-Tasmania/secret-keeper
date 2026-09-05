/**
 * otpauth:// URI parse and build (Google Authenticator style).
 */

import {
  createEmptyOtp,
  type OtpAlgorithm,
  type OtpDigits,
  type OtpSettings,
  type OtpType,
} from "@/lib/account/schema"

function parseAlgorithm(raw: string | null): OtpAlgorithm {
  const s = (raw ?? "SHA1").toUpperCase().replace(/-/g, "")
  if (s === "SHA256") return "SHA256"
  if (s === "SHA512") return "SHA512"
  return "SHA1"
}

function parseDigits(raw: string | null): OtpDigits {
  if (raw === "7") return 7
  if (raw === "8") return 8
  return 6
}

/**
 * Parse an otpauth://totp/... or otpauth://hotp/... URI into OtpSettings.
 * Returns null if the URI is not a valid otpauth link.
 */
export function parseOtpauthUri(uri: string): OtpSettings | null {
  const trimmed = uri.trim()
  if (!trimmed.toLowerCase().startsWith("otpauth://")) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== "otpauth:") return null
  const host = url.hostname.toLowerCase()
  if (host !== "totp" && host !== "hotp") return null
  const type: OtpType = host === "hotp" ? "hotp" : "totp"

  // Path is /Label or /Issuer:Label (percent-encoded)
  let path = decodeURIComponent(url.pathname.replace(/^\//, ""))
  let issuerFromPath = ""
  let label = path
  const colon = path.indexOf(":")
  if (colon >= 0) {
    issuerFromPath = path.slice(0, colon)
    label = path.slice(colon + 1)
  }

  const params = url.searchParams
  const secret = params.get("secret") ?? ""
  if (!secret) return null

  const issuerParam = params.get("issuer") ?? ""
  const issuer = issuerParam || issuerFromPath

  const periodRaw = params.get("period")
  const period = periodRaw ? Number.parseInt(periodRaw, 10) : 30
  const counterRaw = params.get("counter")
  const counter = counterRaw ? Number.parseInt(counterRaw, 10) : 0

  return {
    ...createEmptyOtp(type),
    secret,
    algorithm: parseAlgorithm(params.get("algorithm")),
    digits: parseDigits(params.get("digits")),
    period: Number.isFinite(period) && period > 0 ? period : 30,
    counter: Number.isFinite(counter) && counter >= 0 ? counter : 0,
    issuer,
    label: label.trim(),
  }
}

/** Build an otpauth:// URI from settings (for export / QR later). */
export function buildOtpauthUri(otp: OtpSettings): string {
  const type = otp.type
  const issuer = otp.issuer.trim()
  const label = otp.label.trim() || "Account"
  const pathLabel = issuer
    ? `${encodeURIComponent(issuer)}:${encodeURIComponent(label)}`
    : encodeURIComponent(label)

  const params = new URLSearchParams()
  params.set("secret", otp.secret.replace(/\s+/g, "").toUpperCase())
  if (issuer) params.set("issuer", issuer)
  params.set("algorithm", otp.algorithm)
  params.set("digits", String(otp.digits))
  if (type === "totp") {
    params.set("period", String(otp.period > 0 ? otp.period : 30))
  } else {
    params.set("counter", String(Math.max(0, Math.floor(otp.counter))))
  }

  return `otpauth://${type}/${pathLabel}?${params.toString()}`
}

/**
 * If the pasted text is an otpauth URI, return parsed settings.
 * If it looks like a bare secret, return null (caller keeps typing).
 */
export function tryParseOtpauthOrNull(text: string): OtpSettings | null {
  if (text.trim().toLowerCase().startsWith("otpauth://")) {
    return parseOtpauthUri(text)
  }
  return null
}
