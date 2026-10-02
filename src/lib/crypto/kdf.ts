/**
 * Password → keys. One Argon2id run per unlock, split by HKDF into:
 *  - authKey: sent to the server to prove the password (never decrypts anything)
 *  - pwKey:   stays in the browser and feeds the slot key-encryption keys
 * No pepper: the old VITE_ pepper was public anyway (see security audit F2).
 */

import { argon2idAsync } from "@noble/hashes/argon2.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { sha256 } from "@noble/hashes/sha2.js"

import { fromBase64Url, utf8, wipe } from "@/shared/bytes"
import { KDF_SALT_LEN, validateKdf, type Ckv3Kdf } from "@/shared/ckv3"

export type PasswordKeys = {
  authKey: Uint8Array
  pwKey: Uint8Array
}

export type Kdf = (
  password: string,
  kdf: Ckv3Kdf,
  onProgress?: (fraction: number) => void
) => Promise<PasswordKeys>

/** NFKC so the same visible password yields the same bytes on every OS/keyboard. */
export function normalizePassword(password: string): string {
  return password.normalize("NFKC")
}

export function splitArgonOutput(a: Uint8Array): PasswordKeys {
  return {
    authKey: hkdf(sha256, a, undefined, utf8("CK3/auth"), 32),
    pwKey: hkdf(sha256, a, undefined, utf8("CK3/pw"), 32),
  }
}

export const derivePasswordKeys: Kdf = async (password, kdf, onProgress) => {
  const params = validateKdf(kdf)
  const a = await argon2idAsync(
    utf8(normalizePassword(password)),
    fromBase64Url(params.salt, KDF_SALT_LEN),
    {
      t: params.t,
      m: params.m,
      p: params.p,
      dkLen: 32,
      version: 0x13,
      // Yield to the event loop so the UI stays responsive.
      asyncTick: 20,
      onProgress,
    }
  )
  const keys = splitArgonOutput(a)
  wipe(a)
  return keys
}
