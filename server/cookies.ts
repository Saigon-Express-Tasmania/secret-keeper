/**
 * Trusted-device cookie: HttpOnly, SameSite=Strict, fixed 30-day lifetime.
 * Value = deviceId "." base64url(secret); only SHA-256(secret) is stored.
 * The cookie only skips the second factor — the password is always required.
 */

import { sha256 } from "@noble/hashes/sha2.js"

import { fromBase64Url, randomBytes, toBase64Url, toHex, utf8 } from "../src/shared/bytes"

export const DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60
const DEVICE_ID_BYTES = 9
const DEVICE_SECRET_BYTES = 32

/**
 * One cookie per vault. `__Host-` (Secure, Path=/, no Domain) on HTTPS;
 * Safari rejects Secure cookies on http://localhost, so plain http drops both.
 */
export function deviceCookieName(vaultName: string, secure: boolean): string {
  const id = toHex(sha256(utf8(vaultName))).slice(0, 16)
  return `${secure ? "__Host-" : ""}ckd-${id}`
}

export function serializeCookie(
  name: string,
  value: string,
  options: { secure: boolean; maxAge: number }
): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${options.maxAge}`,
    ...(options.secure ? ["Secure"] : []),
  ].join("; ")
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const index = part.indexOf("=")
    if (index < 0) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

export type DeviceToken = { id: string; secret: Uint8Array }

export function newDeviceToken(): DeviceToken & { value: string } {
  const id = toBase64Url(randomBytes(DEVICE_ID_BYTES))
  const secret = randomBytes(DEVICE_SECRET_BYTES)
  return { id, secret, value: `${id}.${toBase64Url(secret)}` }
}

export function parseDeviceToken(value: string | null): DeviceToken | null {
  if (!value) return null
  const [id, secretText, extra] = value.split(".")
  if (!id || !secretText || extra !== undefined) return null
  try {
    fromBase64Url(id, DEVICE_ID_BYTES)
    return { id, secret: fromBase64Url(secretText, DEVICE_SECRET_BYTES) }
  } catch {
    return null
  }
}

export function hashDeviceSecret(secret: Uint8Array): string {
  return toBase64Url(sha256(secret))
}
