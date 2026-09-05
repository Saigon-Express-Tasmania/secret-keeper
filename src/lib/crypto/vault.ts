/**
 * Vault encryption: Argon2id KDF + AES-256-GCM.
 *
 * Secrets:
 * - Master password (from Gate; never stored)
 * - VITE_VAULT_SALT_KEY (env pepper; not stored in the blob)
 * - Random 16-byte salt (generated on encrypt; stored in blob header)
 *
 * Blob layout (CKV2):
 * - 4 bytes magic "CKV2"
 * - 1 byte format version (2)
 * - 1 byte KDF id (1 = Argon2id)
 * - 16 bytes random salt
 * - 12 bytes nonce
 * - ciphertext + 16-byte GCM tag
 *
 * GCM plaintext is a CKZ1 pack (compressed + scrambled VaultArchive JSON).
 * Legacy CKV1 blobs (raw flat VaultPayload JSON) are still decrypted and migrated.
 */

import { argon2id } from "@noble/hashes/argon2.js"

import { packArchive, unpackArchive } from "@/lib/crypto/pack"
import {
  migrateV1ItemsToArchive,
  type RawVaultArchive,
  type VaultArchive,
} from "@/lib/vault/fs"
import { prepareEmptyVault } from "@/lib/vault/session"

export type EncryptedVaultBlob = Uint8Array

/** @deprecated Use VaultArchive — kept as alias for call-site migration. */
export type VaultPayload = VaultArchive

const MAGIC_V1 = new TextEncoder().encode("CKV1")
const MAGIC_V2 = new TextEncoder().encode("CKV2")
const FORMAT_VERSION_V1 = 1
const FORMAT_VERSION_V2 = 2
const KDF_ARGON2ID = 1
const SALT_LEN = 16
const NONCE_LEN = 12
const HEADER_LEN = 4 + 1 + 1 + SALT_LEN + NONCE_LEN // 34

const ARGON2_OPTS = {
  t: 3,
  m: 65536, // 64 MiB (kibibytes)
  p: 1,
  dkLen: 32,
} as const

/** Copy into a fresh ArrayBuffer-backed view (DOM BufferSource typing). */
function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

function getPepper(): string {
  const pepper = import.meta.env.VITE_VAULT_SALT_KEY
  if (!pepper || typeof pepper !== "string" || pepper.length === 0) {
    throw new Error(
      "VITE_VAULT_SALT_KEY is missing. Add a long random secret to .env.local."
    )
  }
  return pepper
}

function aadBytes(
  magic: Uint8Array,
  formatVersion: number
): Uint8Array<ArrayBuffer> {
  // Authenticate magic + format version so the header cannot be swapped.
  const out = new Uint8Array(5)
  out.set(magic, 0)
  out[4] = formatVersion
  return out
}

function magicMatches(blob: Uint8Array, magic: Uint8Array): boolean {
  for (let i = 0; i < 4; i++) {
    if (blob[i] !== magic[i]) return false
  }
  return true
}

export async function deriveKey(
  masterPassword: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const raw = argon2id(masterPassword, salt, {
    ...ARGON2_OPTS,
    key: getPepper(),
  })

  return crypto.subtle.importKey(
    "raw",
    asBufferSource(raw),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  )
}

/** Encrypt vault archive for upload / local cache (always writes CKV2). */
export async function encryptVault(
  archive: VaultArchive,
  masterPassword: string
): Promise<EncryptedVaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN))
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN))
  const key = await deriveKey(masterPassword, salt)

  const plaintext = asBufferSource(await packArchive(archive))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: aadBytes(MAGIC_V2, FORMAT_VERSION_V2),
      },
      key,
      plaintext
    )
  )

  const blob = new Uint8Array(HEADER_LEN + ciphertext.length)
  let offset = 0
  blob.set(MAGIC_V2, offset)
  offset += 4
  blob[offset++] = FORMAT_VERSION_V2
  blob[offset++] = KDF_ARGON2ID
  blob.set(salt, offset)
  offset += SALT_LEN
  blob.set(nonce, offset)
  offset += NONCE_LEN
  blob.set(ciphertext, offset)
  return blob
}

type V1Payload = {
  version: 1
  updatedAt: string
  items: unknown[]
}

function parseV1Payload(json: string): V1Payload {
  const payload = JSON.parse(json) as V1Payload
  if (payload.version !== 1 || !Array.isArray(payload.items)) {
    throw new Error("Invalid vault payload shape")
  }
  return payload
}

async function decryptCiphertext(
  blob: EncryptedVaultBlob,
  masterPassword: string,
  magic: Uint8Array,
  formatVersion: number
): Promise<Uint8Array> {
  if (blob.length < HEADER_LEN + 16) {
    throw new Error("Invalid vault blob: too short")
  }

  const formatVersionByte = blob[4]!
  const kdfId = blob[5]!
  if (formatVersionByte !== formatVersion) {
    throw new Error(`Unsupported vault format version: ${formatVersionByte}`)
  }
  if (kdfId !== KDF_ARGON2ID) {
    throw new Error(`Unsupported vault KDF id: ${kdfId}`)
  }

  const salt = asBufferSource(blob.subarray(6, 6 + SALT_LEN))
  const nonce = asBufferSource(blob.subarray(6 + SALT_LEN, HEADER_LEN))
  const ciphertext = asBufferSource(blob.subarray(HEADER_LEN))

  const key = await deriveKey(masterPassword, salt)
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: aadBytes(magic, formatVersion),
      },
      key,
      ciphertext
    )
  )
}

/**
 * Decrypt a downloaded blob into a raw archive (v2 plaintext or v3).
 * Callers must run prepareSessionArchive before exposing to the UI.
 */
export async function decryptVault(
  blob: EncryptedVaultBlob,
  masterPassword: string
): Promise<RawVaultArchive> {
  if (blob.length < HEADER_LEN + 16) {
    throw new Error("Invalid vault blob: too short")
  }

  const isV2 = magicMatches(blob, MAGIC_V2)
  const isV1 = magicMatches(blob, MAGIC_V1)
  if (!isV2 && !isV1) {
    throw new Error("Invalid vault blob: bad magic")
  }

  try {
    if (isV2) {
      const plaintext = await decryptCiphertext(
        blob,
        masterPassword,
        MAGIC_V2,
        FORMAT_VERSION_V2
      )
      return await unpackArchive(plaintext)
    }

    const plaintext = await decryptCiphertext(
      blob,
      masterPassword,
      MAGIC_V1,
      FORMAT_VERSION_V1
    )
    const json = new TextDecoder().decode(plaintext)
    const v1 = parseV1Payload(json)
    return migrateV1ItemsToArchive(v1)
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("VITE_VAULT_SALT_KEY") ||
        err.message.includes("Invalid vault") ||
        err.message.includes("Invalid CKZ1") ||
        err.message.includes("Unsupported vault"))
    ) {
      throw err
    }
    throw new Error("Invalid master password.")
  }
}

/** Create an empty prepared vault (session payload + DEK). */
export async function createEmptyVault() {
  return prepareEmptyVault()
}

export type { VaultArchive, RawVaultArchive }
