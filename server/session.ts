/**
 * Stateless session tokens: "s1." + base64url(claims JSON) + "." + MAC.
 * Sent as a Bearer header (never a cookie, so no CSRF). Bound to the vault
 * name, vault id and auth epoch: any re-key bumps the epoch and kills every
 * older session.
 */

import { bytesEqual, fromBase64Url, fromUtf8, toBase64Url, utf8 } from "../src/shared/bytes"
import { mac, type ServerKeys } from "./secrets"

export const SESSION_TTL_SECONDS = 12 * 60 * 60
const PREFIX = "s1"

export type SessionClaims = {
  /** Vault name. */
  n: string
  /** Vault id. */
  vid: string
  /** Auth epoch at issue time. */
  ae: number
  /** Expiry, unix seconds. */
  exp: number
  /** Trusted-device id when the unlock came from one. */
  did?: string
}

export function issueSession(keys: ServerKeys, claims: SessionClaims): string {
  const payload = toBase64Url(utf8(JSON.stringify(claims)))
  const tag = toBase64Url(mac(keys.session, PREFIX, payload))
  return `${PREFIX}.${payload}.${tag}`
}

export function verifySession(
  keys: ServerKeys,
  token: string | null | undefined,
  nowSeconds: number
): SessionClaims | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== PREFIX) return null
  const [, payload, tag] = parts as [string, string, string]
  let actual: Uint8Array
  try {
    actual = fromBase64Url(tag, 32)
  } catch {
    return null
  }
  if (!bytesEqual(mac(keys.session, PREFIX, payload), actual)) return null

  let claims: unknown
  try {
    claims = JSON.parse(fromUtf8(fromBase64Url(payload)))
  } catch {
    return null
  }
  if (!claims || typeof claims !== "object") return null
  const c = claims as Record<string, unknown>
  if (
    typeof c.n !== "string" ||
    typeof c.vid !== "string" ||
    !Number.isSafeInteger(c.ae) ||
    !Number.isSafeInteger(c.exp) ||
    (c.did !== undefined && typeof c.did !== "string")
  ) {
    return null
  }
  if ((c.exp as number) <= nowSeconds) return null
  return {
    n: c.n,
    vid: c.vid,
    ae: c.ae as number,
    exp: c.exp as number,
    ...(c.did ? { did: c.did as string } : {}),
  }
}

/** Read "Authorization: Bearer <token>". */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match ? match[1]! : null
}
