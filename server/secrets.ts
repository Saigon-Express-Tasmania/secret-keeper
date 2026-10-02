/**
 * Server-side keys, all derived from CK_SERVER_SECRET with HKDF:
 *  - verifier: HMAC key for password / Recovery Key verifiers
 *  - session:  HMAC key for stateless session tokens
 *  - fake:     deterministic fake KDF params for unknown vault names
 *  - seal:     AES-GCM key for values sealed at rest (server shares, TOTP, email)
 * Stored values carry a "1." version prefix so the secret can be rotated later.
 */

import { hkdf } from "@noble/hashes/hkdf.js"
import { hmac } from "@noble/hashes/hmac.js"
import { sha256 } from "@noble/hashes/sha2.js"

import {
  bytesEqual,
  concatBytes,
  fromBase64Url,
  randomBytes,
  toBase64Url,
  toBuffer,
  utf8,
  writeUint32LE,
} from "../src/shared/bytes"
import { DEFAULT_KDF, KDF_SALT_LEN, type Ckv3Kdf } from "../src/shared/ckv3"

export const MIN_SERVER_SECRET_BYTES = 32
const VERSION = "1."

export type ServerKeys = {
  verifier: Uint8Array
  session: Uint8Array
  fake: Uint8Array
  seal: CryptoKey
}

/** Accepts standard base64 (openssl rand -base64 32) or base64url. */
export function decodeServerSecret(text: string): Uint8Array {
  const normalized = text.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  const bytes = fromBase64Url(normalized)
  if (bytes.byteLength < MIN_SERVER_SECRET_BYTES) {
    throw new Error(
      `CK_SERVER_SECRET must decode to at least ${MIN_SERVER_SECRET_BYTES} bytes`
    )
  }
  return bytes
}

export async function deriveServerKeys(secret: Uint8Array): Promise<ServerKeys> {
  const sub = (label: string) =>
    hkdf(sha256, secret, undefined, utf8(`CK3/server/${label}`), 32)
  const sealBytes = sub("seal")
  const seal = await crypto.subtle.importKey(
    "raw",
    toBuffer(sealBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  )
  sealBytes.fill(0)
  return { verifier: sub("verifier"), session: sub("session"), fake: sub("fake"), seal }
}

/** HMAC-SHA256 over length-prefixed parts (unambiguous concatenation). */
export function mac(key: Uint8Array, ...parts: (Uint8Array | string)[]): Uint8Array {
  const chunks: Uint8Array[] = []
  for (const part of parts) {
    const bytes = typeof part === "string" ? utf8(part) : part
    const length = new Uint8Array(4)
    writeUint32LE(length, 0, bytes.byteLength)
    chunks.push(length, bytes)
  }
  return hmac(sha256, key, concatBytes(...chunks))
}

export function sha256Base64Url(bytes: Uint8Array): string {
  return toBase64Url(sha256(bytes))
}

/** "1." + HMAC(k_ver, kind ‖ vaultId ‖ credential). */
export function makeVerifier(
  keys: ServerKeys,
  kind: "password" | "recovery",
  vaultId: string,
  credential: Uint8Array
): string {
  return VERSION + toBase64Url(mac(keys.verifier, `verifier/${kind}`, vaultId, credential))
}

/** Constant-time verifier check; a missing or malformed record never matches. */
export function checkVerifier(
  keys: ServerKeys,
  stored: string | undefined,
  kind: "password" | "recovery",
  vaultId: string,
  credential: Uint8Array
): boolean {
  const expected = mac(keys.verifier, `verifier/${kind}`, vaultId, credential)
  if (!stored?.startsWith(VERSION)) return false
  let actual: Uint8Array
  try {
    actual = fromBase64Url(stored.slice(VERSION.length), expected.byteLength)
  } catch {
    return false
  }
  return bytesEqual(expected, actual)
}

/** AES-GCM seal with AAD bound to where the value lives (vault + field). */
export async function seal(
  keys: ServerKeys,
  context: readonly string[],
  plaintext: Uint8Array
): Promise<string> {
  const nonce = randomBytes(12)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: utf8(context.join("\u0000")) },
      keys.seal,
      toBuffer(plaintext)
    )
  )
  return VERSION + toBase64Url(concatBytes(nonce, ciphertext))
}

export async function unseal(
  keys: ServerKeys,
  context: readonly string[],
  sealed: string
): Promise<Uint8Array<ArrayBuffer>> {
  if (!sealed.startsWith(VERSION)) throw new Error("Unsupported sealed value")
  const bytes = fromBase64Url(sealed.slice(VERSION.length))
  if (bytes.byteLength < 12 + 16) throw new Error("Sealed value too short")
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes.subarray(0, 12),
        additionalData: utf8(context.join("\u0000")),
      },
      keys.seal,
      bytes.subarray(12)
    )
  )
}

/**
 * Plausible KDF parameters for a vault that does not exist, stable per name,
 * so prelogin does not reveal which names exist.
 */
export function fakeKdf(keys: ServerKeys, vaultName: string): Ckv3Kdf {
  return {
    alg: "argon2id",
    v: 19,
    ...DEFAULT_KDF,
    salt: toBase64Url(mac(keys.fake, "salt", vaultName).subarray(0, KDF_SALT_LEN)),
  }
}
