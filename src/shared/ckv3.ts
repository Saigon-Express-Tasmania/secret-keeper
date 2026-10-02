/**
 * CKV3 container: the on-disk/remote vault format (isomorphic codec).
 *
 *   0  "CKV3"            magic (4)
 *   4  format = 1        (1)
 *   5  H                 u32 LE header length (2..64 KiB)
 *   9  header JSON       (H bytes, UTF-8)
 *   9+H  nonce           (12)
 *   21+H ciphertext+tag  AES-256-GCM(bodyKey, body, AAD = bytes[0 .. 9+H))
 *
 * The header is authenticated by the body's AAD, so after a successful body
 * decrypt every header field is trusted. Before that, a tampered header can
 * only make unwrapping fail. The server parses headers (never bodies) to
 * enforce revision, vault identity and slot-structure rules on upload.
 */

import {
  concatBytes,
  fromBase64Url,
  fromUtf8,
  readUint32LE,
  sha256,
  toBase64Url,
  utf8,
  writeUint32LE,
} from "./bytes"

export const CKV3_FORMAT = 1
const MAGIC = utf8("CKV3")
export const PREFIX_LEN = 9
export const NONCE_LEN = 12
export const GCM_TAG_LEN = 16
export const MAX_HEADER_BYTES = 64 * 1024
/** Netlify Functions buffer at most ~4.5 MiB of binary body; stay below it. */
export const MAX_BLOB_BYTES = 3.5 * 1024 * 1024

export const VAULT_ID_LEN = 16
export const KDF_SALT_LEN = 16
/** A wrapped 32-byte key: ciphertext + GCM tag. */
export const WRAPPED_KEY_LEN = 48
export const PASSKEY_SALT_LEN = 32
export const MAX_PASSKEYS = 10
export const MAX_CREDENTIAL_ID_LEN = 1023

/** Argon2id bounds (KiB / passes / lanes). Upper bounds stop DoS via headers. */
export const KDF_BOUNDS = {
  m: [19_456, 262_144],
  t: [1, 10],
  p: [1, 4],
} as const
export const DEFAULT_KDF = { m: 65_536, t: 3, p: 1 } as const

export const SLOT_TYPES = ["primary", "email", "recovery"] as const
export type SlotType = (typeof SLOT_TYPES)[number]

export type Ckv3Slot = { type: SlotType; n: string; ct: string }
export type Ckv3Passkey = { id: string; salt: string; n: string; ct: string }
export type Ckv3Kdf = {
  alg: "argon2id"
  v: 19
  m: number
  t: number
  p: number
  salt: string
}
export type Ckv3Purpose = "vault" | "export"
export type Ckv3Header = {
  v: 1
  purpose: Ckv3Purpose
  vaultId: string
  rev: number
  kdf?: Ckv3Kdf
  requirePasskey?: true
  slots: Ckv3Slot[]
  passkeys?: Ckv3Passkey[]
}

export type Ckv3Parsed = {
  header: Ckv3Header
  /** magic ‖ format ‖ length ‖ header bytes — the body's AAD. */
  aad: Uint8Array<ArrayBuffer>
  nonce: Uint8Array<ArrayBuffer>
  ciphertext: Uint8Array<ArrayBuffer>
}

export class Ckv3FormatError extends Error {
  readonly code = "bad_blob"
  constructor(message: string) {
    super(message)
    this.name = "Ckv3FormatError"
  }
}

function fail(message: string): never {
  throw new Ckv3FormatError(`Invalid vault file: ${message}`)
}

function asRecord(
  value: unknown,
  name: string,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} must be an object`)
  }
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!required.includes(key) && !optional.includes(key)) {
      fail(`unexpected field ${name}.${key}`)
    }
  }
  for (const key of required) {
    if (!(key in record)) fail(`missing field ${name}.${key}`)
  }
  return record
}

function b64Field(value: unknown, name: string, min: number, max = min): string {
  if (typeof value !== "string") fail(`${name} must be a string`)
  let decoded: Uint8Array
  try {
    decoded = fromBase64Url(value)
  } catch {
    fail(`${name} is not base64url`)
  }
  if (decoded.byteLength < min || decoded.byteLength > max) {
    fail(`${name} has the wrong length`)
  }
  return value
}

function intField(value: unknown, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${name} is out of range`)
  }
  return value as number
}

export function validateKdf(raw: unknown): Ckv3Kdf {
  const kdf = asRecord(raw, "kdf", ["alg", "v", "m", "t", "p", "salt"])
  if (kdf.alg !== "argon2id") fail("unsupported KDF")
  if (kdf.v !== 19) fail("unsupported Argon2 version")
  return {
    alg: "argon2id",
    v: 19,
    m: intField(kdf.m, "kdf.m", ...KDF_BOUNDS.m),
    t: intField(kdf.t, "kdf.t", ...KDF_BOUNDS.t),
    p: intField(kdf.p, "kdf.p", ...KDF_BOUNDS.p),
    salt: b64Field(kdf.salt, "kdf.salt", KDF_SALT_LEN),
  }
}

/** Strict header validation; returns a normalized copy. */
export function validateHeader(raw: unknown): Ckv3Header {
  const h = asRecord(
    raw,
    "header",
    ["v", "purpose", "vaultId", "rev", "slots"],
    ["kdf", "requirePasskey", "passkeys"]
  )
  if (h.v !== 1) fail("unsupported header version")
  if (h.purpose !== "vault" && h.purpose !== "export") fail("bad purpose")
  const purpose = h.purpose

  const header: Ckv3Header = {
    v: 1,
    purpose,
    vaultId: b64Field(h.vaultId, "vaultId", VAULT_ID_LEN),
    rev: intField(h.rev, "rev", 1, Number.MAX_SAFE_INTEGER),
    slots: [],
  }

  if (purpose === "vault") {
    if (h.kdf === undefined) fail("vault headers need kdf")
    header.kdf = validateKdf(h.kdf)
  } else if (h.kdf !== undefined) {
    fail("export headers carry no kdf")
  }

  if (!Array.isArray(h.slots) || h.slots.length < 1 || h.slots.length > 3) {
    fail("slots must be a non-empty array")
  }
  const seen = new Set<SlotType>()
  for (const [i, rawSlot] of h.slots.entries()) {
    const slot = asRecord(rawSlot, `slots[${i}]`, ["type", "n", "ct"])
    if (!SLOT_TYPES.includes(slot.type as SlotType)) fail("unknown slot type")
    const type = slot.type as SlotType
    if (seen.has(type)) fail("duplicate slot type")
    seen.add(type)
    header.slots.push({
      type,
      n: b64Field(slot.n, `slots[${i}].n`, NONCE_LEN),
      ct: b64Field(slot.ct, `slots[${i}].ct`, WRAPPED_KEY_LEN),
    })
  }
  header.slots.sort(
    (a, b) => SLOT_TYPES.indexOf(a.type) - SLOT_TYPES.indexOf(b.type)
  )

  if (purpose === "vault") {
    if (!seen.has("primary") || !seen.has("recovery")) {
      fail("vaults need primary and recovery slots")
    }
  } else if (seen.size !== 1 || !seen.has("recovery")) {
    fail("exports carry only a recovery slot")
  }

  if (h.passkeys !== undefined) {
    if (purpose !== "vault") fail("exports carry no passkeys")
    if (!Array.isArray(h.passkeys) || h.passkeys.length > MAX_PASSKEYS) {
      fail("too many passkeys")
    }
    const ids = new Set<string>()
    header.passkeys = h.passkeys.map((rawPk, i) => {
      const pk = asRecord(rawPk, `passkeys[${i}]`, ["id", "salt", "n", "ct"])
      const id = b64Field(pk.id, `passkeys[${i}].id`, 1, MAX_CREDENTIAL_ID_LEN)
      if (ids.has(id)) fail("duplicate passkey")
      ids.add(id)
      return {
        id,
        salt: b64Field(pk.salt, `passkeys[${i}].salt`, PASSKEY_SALT_LEN),
        n: b64Field(pk.n, `passkeys[${i}].n`, NONCE_LEN),
        ct: b64Field(pk.ct, `passkeys[${i}].ct`, WRAPPED_KEY_LEN),
      }
    })
    if (header.passkeys.length === 0) delete header.passkeys
  }

  if (h.requirePasskey !== undefined) {
    if (h.requirePasskey !== true) fail("requirePasskey must be true when set")
    if (!header.passkeys?.length) fail("requirePasskey needs a passkey")
    header.requirePasskey = true
  }

  return header
}

/** Canonical header JSON (fixed key order) as UTF-8 bytes. */
export function encodeHeader(input: Ckv3Header): Uint8Array<ArrayBuffer> {
  const h = validateHeader(input)
  const ordered: Record<string, unknown> = {
    v: h.v,
    purpose: h.purpose,
    vaultId: h.vaultId,
    rev: h.rev,
  }
  if (h.kdf) {
    const { alg, v, m, t, p, salt } = h.kdf
    ordered.kdf = { alg, v, m, t, p, salt }
  }
  if (h.requirePasskey) ordered.requirePasskey = true
  ordered.slots = h.slots.map(({ type, n, ct }) => ({ type, n, ct }))
  if (h.passkeys) {
    ordered.passkeys = h.passkeys.map(({ id, salt, n, ct }) => ({ id, salt, n, ct }))
  }
  return utf8(JSON.stringify(ordered))
}

/** magic ‖ format ‖ u32 length ‖ header — everything the body AAD covers. */
export function containerPrefix(headerBytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (headerBytes.byteLength < 2 || headerBytes.byteLength > MAX_HEADER_BYTES) {
    fail("header size out of range")
  }
  const fixed = new Uint8Array(PREFIX_LEN)
  fixed.set(MAGIC, 0)
  fixed[4] = CKV3_FORMAT
  writeUint32LE(fixed, 5, headerBytes.byteLength)
  return concatBytes(fixed, headerBytes)
}

export function assembleCkv3(
  aad: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array
): Uint8Array<ArrayBuffer> {
  if (nonce.byteLength !== NONCE_LEN) fail("bad nonce length")
  const blob = concatBytes(aad, nonce, ciphertext)
  if (blob.byteLength > MAX_BLOB_BYTES) fail("vault is too large")
  return blob
}

export function isCkv3(blob: Uint8Array): boolean {
  return (
    blob.byteLength >= PREFIX_LEN &&
    MAGIC.every((byte, i) => blob[i] === byte)
  )
}

export function parseCkv3(blob: Uint8Array): Ckv3Parsed {
  if (blob.byteLength > MAX_BLOB_BYTES) fail("vault is too large")
  if (!isCkv3(blob)) fail("not a CKV3 file")
  if (blob[4] !== CKV3_FORMAT) fail("unsupported format")
  const headerLength = readUint32LE(blob, 5)
  if (headerLength < 2 || headerLength > MAX_HEADER_BYTES) {
    fail("header size out of range")
  }
  const bodyStart = PREFIX_LEN + headerLength
  if (bodyStart + NONCE_LEN + GCM_TAG_LEN > blob.byteLength) fail("truncated")

  let raw: unknown
  try {
    raw = JSON.parse(fromUtf8(blob.subarray(PREFIX_LEN, bodyStart)))
  } catch {
    fail("header is not valid JSON")
  }
  const header = validateHeader(raw)
  const copy = (start: number, end?: number) => {
    const part = blob.subarray(start, end)
    const out = new Uint8Array(part.byteLength)
    out.set(part)
    return out
  }
  return {
    header,
    aad: copy(0, bodyStart),
    nonce: copy(bodyStart, bodyStart + NONCE_LEN),
    ciphertext: copy(bodyStart + NONCE_LEN),
  }
}

/**
 * Hash of every security-relevant header field (KDF, slots, passkeys,
 * requirePasskey). An ordinary save must leave it unchanged; anything else
 * is a re-key and needs step-up proof on the server.
 */
export async function slotStructureHash(header: Ckv3Header): Promise<string> {
  const canonical = JSON.stringify([
    header.kdf
      ? [header.kdf.alg, header.kdf.v, header.kdf.m, header.kdf.t, header.kdf.p, header.kdf.salt]
      : null,
    header.requirePasskey === true,
    header.slots.map((s) => [s.type, s.n, s.ct]),
    (header.passkeys ?? []).map((p) => [p.id, p.salt, p.n, p.ct]),
  ])
  return toBase64Url(await sha256(utf8(canonical)))
}
