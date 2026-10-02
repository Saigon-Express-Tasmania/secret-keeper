/**
 * Vault key hierarchy (CKV3).
 *
 *   VK  random 256-bit vault key; bodyKey = HKDF(VK, "CK3/body")
 *   Each slot wraps VK with AES-256-GCM under a key-encryption key (KEK):
 *     primary  = HKDF(pwKey ‖ SK ‖ P [‖ KP], salt = vaultId)  daily unlock
 *     email    = HKDF(pwKey ‖ E [‖ KP],      salt = vaultId)  new machine via email link
 *     recovery = HKDF(R,                     salt = vaultId)  break-glass
 *   SK = Secret Key (128-bit, device + Emergency Kit)
 *   R  = Recovery Key (256-bit, Emergency Kit)
 *   P, E = server shares (released by the server after auth)
 *   KP = passkey key, wrapped per credential with HKDF(PRF output)
 *
 * Factors are fixed-length and concatenated in a fixed order, and the HKDF
 * info names the slot type and factor set, so KEKs never collide.
 */

import { hkdf } from "@noble/hashes/hkdf.js"
import { sha256 } from "@noble/hashes/sha2.js"

import { base32Decode, base32Encode } from "@/lib/otp/base32"
import {
  concatBytes,
  fromBase64Url,
  randomBytes,
  toBase64Url,
  toBuffer,
  utf8,
  wipe,
} from "@/shared/bytes"
import {
  NONCE_LEN,
  PASSKEY_SALT_LEN,
  VAULT_ID_LEN,
  WRAPPED_KEY_LEN,
  type Ckv3Passkey,
  type Ckv3Slot,
  type SlotType,
} from "@/shared/ckv3"

export const KEY_LEN = 32
export const SECRET_KEY_LEN = 16
export const RECOVERY_KEY_LEN = 32

export class SlotOpenError extends Error {
  constructor(message = "Could not open the vault key.") {
    super(message)
    this.name = "SlotOpenError"
  }
}

function derive(ikm: Uint8Array, vaultId: string | null, info: string): Uint8Array {
  const salt = vaultId === null ? undefined : fromBase64Url(vaultId, VAULT_ID_LEN)
  return hkdf(sha256, ikm, salt, utf8(info), KEY_LEN)
}

function expectLength(bytes: Uint8Array, length: number, name: string): void {
  if (bytes.byteLength !== length) throw new Error(`${name} must be ${length} bytes`)
}

// --- KEKs --------------------------------------------------------------------

export function primaryKek(
  vaultId: string,
  pwKey: Uint8Array,
  secretKey: Uint8Array,
  srvShare: Uint8Array,
  passkeyKey?: Uint8Array
): Uint8Array {
  expectLength(pwKey, KEY_LEN, "pwKey")
  expectLength(secretKey, SECRET_KEY_LEN, "Secret Key")
  expectLength(srvShare, KEY_LEN, "server share")
  if (passkeyKey) expectLength(passkeyKey, KEY_LEN, "passkey key")
  const ikm = concatBytes(pwKey, secretKey, srvShare, passkeyKey ?? new Uint8Array(0))
  const kek = derive(ikm, vaultId, passkeyKey ? "CK3/kek/primary+pk" : "CK3/kek/primary")
  wipe(ikm)
  return kek
}

export function emailKek(
  vaultId: string,
  pwKey: Uint8Array,
  emailShare: Uint8Array,
  passkeyKey?: Uint8Array
): Uint8Array {
  expectLength(pwKey, KEY_LEN, "pwKey")
  expectLength(emailShare, KEY_LEN, "email share")
  if (passkeyKey) expectLength(passkeyKey, KEY_LEN, "passkey key")
  const ikm = concatBytes(pwKey, emailShare, passkeyKey ?? new Uint8Array(0))
  const kek = derive(ikm, vaultId, passkeyKey ? "CK3/kek/email+pk" : "CK3/kek/email")
  wipe(ikm)
  return kek
}

export function recoveryKek(vaultId: string, recoveryKey: Uint8Array): Uint8Array {
  expectLength(recoveryKey, RECOVERY_KEY_LEN, "Recovery Key")
  return derive(recoveryKey, vaultId, "CK3/kek/recovery")
}

/** Proof of the Recovery Key for the server; independent of the KEK. */
export function recoveryAuthKey(recoveryKey: Uint8Array): Uint8Array {
  expectLength(recoveryKey, RECOVERY_KEY_LEN, "Recovery Key")
  return derive(recoveryKey, null, "CK3/rk-auth")
}

export function passkeyWrappingKey(vaultId: string, prfOutput: Uint8Array): Uint8Array {
  if (prfOutput.byteLength < 32) throw new Error("PRF output too short")
  return derive(prfOutput, vaultId, "CK3/passkey")
}

export function bodyKeyBytes(vaultKey: Uint8Array): Uint8Array {
  expectLength(vaultKey, KEY_LEN, "vault key")
  return derive(vaultKey, null, "CK3/body")
}

// --- AES-GCM key wrapping ----------------------------------------------------

async function importAesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toBuffer(raw), { name: "AES-GCM" }, false, usages)
}

export function slotAad(type: SlotType, vaultId: string): Uint8Array<ArrayBuffer> {
  return utf8(`CK3/slot/${type}/${vaultId}`)
}

export function passkeyAad(vaultId: string, credentialId: string): Uint8Array<ArrayBuffer> {
  return utf8(`CK3/pk/${vaultId}/${credentialId}`)
}

export async function wrapKey(
  kek: Uint8Array,
  key: Uint8Array,
  aad: Uint8Array
): Promise<{ n: string; ct: string }> {
  expectLength(key, KEY_LEN, "wrapped key")
  const nonce = randomBytes(NONCE_LEN)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: toBuffer(aad) },
      await importAesKey(kek, ["encrypt"]),
      toBuffer(key)
    )
  )
  return { n: toBase64Url(nonce), ct: toBase64Url(ct) }
}

/** Throws SlotOpenError when the KEK is wrong or the slot was tampered with. */
export async function unwrapKey(
  kek: Uint8Array,
  wrapped: { n: string; ct: string },
  aad: Uint8Array
): Promise<Uint8Array> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: fromBase64Url(wrapped.n, NONCE_LEN),
          additionalData: toBuffer(aad),
        },
        await importAesKey(kek, ["decrypt"]),
        fromBase64Url(wrapped.ct, WRAPPED_KEY_LEN)
      )
    )
  } catch {
    throw new SlotOpenError()
  }
}

export async function makeSlot(
  type: SlotType,
  vaultId: string,
  kek: Uint8Array,
  vaultKey: Uint8Array
): Promise<Ckv3Slot> {
  const { n, ct } = await wrapKey(kek, vaultKey, slotAad(type, vaultId))
  return { type, n, ct }
}

export async function openSlot(
  slots: readonly Ckv3Slot[],
  type: SlotType,
  vaultId: string,
  kek: Uint8Array
): Promise<Uint8Array> {
  const slot = slots.find((s) => s.type === type)
  if (!slot) throw new SlotOpenError(`This vault has no ${type} slot.`)
  return unwrapKey(kek, slot, slotAad(type, vaultId))
}

export async function wrapPasskeyKey(
  vaultId: string,
  credentialId: string,
  prfSalt: Uint8Array,
  prfOutput: Uint8Array,
  passkeyKey: Uint8Array
): Promise<Ckv3Passkey> {
  expectLength(prfSalt, PASSKEY_SALT_LEN, "PRF salt")
  const wrapping = passkeyWrappingKey(vaultId, prfOutput)
  const { n, ct } = await wrapKey(wrapping, passkeyKey, passkeyAad(vaultId, credentialId))
  wipe(wrapping)
  return { id: credentialId, salt: toBase64Url(prfSalt), n, ct }
}

export async function unwrapPasskeyKey(
  vaultId: string,
  entry: Ckv3Passkey,
  prfOutput: Uint8Array
): Promise<Uint8Array> {
  const wrapping = passkeyWrappingKey(vaultId, prfOutput)
  try {
    return await unwrapKey(wrapping, entry, passkeyAad(vaultId, entry.id))
  } finally {
    wipe(wrapping)
  }
}

// --- Random material ---------------------------------------------------------

export const newVaultKey = () => randomBytes(KEY_LEN)
export const newShare = () => randomBytes(KEY_LEN)
export const newSecretKey = () => randomBytes(SECRET_KEY_LEN)
export const newRecoveryKey = () => randomBytes(RECOVERY_KEY_LEN)
export const newVaultId = () => toBase64Url(randomBytes(VAULT_ID_LEN))
export const newKdfSalt = () => toBase64Url(randomBytes(16))

// --- Human-readable keys (Emergency Kit) -------------------------------------

type KeyKind = "SK1" | "RK1"
const KIND_LENGTH: Record<KeyKind, number> = { SK1: SECRET_KEY_LEN, RK1: RECOVERY_KEY_LEN }

export class KeyFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "KeyFormatError"
  }
}

function checksum(kind: KeyKind, key: Uint8Array): Uint8Array {
  return sha256(concatBytes(utf8(kind), key)).subarray(0, 2)
}

/** e.g. SK1-ABCDE-FGHIJ-…; base32 of key ‖ 2-byte checksum, groups of five. */
export function formatKey(kind: KeyKind, key: Uint8Array): string {
  expectLength(key, KIND_LENGTH[kind], kind)
  const encoded = base32Encode(concatBytes(key, checksum(kind, key)))
  return `${kind}-${encoded.match(/.{1,5}/g)!.join("-")}`
}

/** Accepts any case, spaces or hyphens; 0/1/8 are read as O/I/B. Checks the checksum. */
export function parseKey(kind: KeyKind, text: string): Uint8Array {
  let compact = text.toUpperCase().replace(/[\s-]/g, "")
  if (compact.startsWith(kind)) compact = compact.slice(kind.length)
  compact = compact.replace(/0/g, "O").replace(/1/g, "I").replace(/8/g, "B")
  let bytes: Uint8Array
  try {
    bytes = base32Decode(compact)
  } catch {
    throw new KeyFormatError("That key contains characters that are not used in keys.")
  }
  const length = KIND_LENGTH[kind]
  if (bytes.byteLength !== length + 2) {
    throw new KeyFormatError("That key has the wrong length.")
  }
  const key = bytes.slice(0, length)
  const expected = checksum(kind, key)
  if (bytes[length] !== expected[0] || bytes[length + 1] !== expected[1]) {
    throw new KeyFormatError("That key has a typo (checksum mismatch).")
  }
  return key
}
