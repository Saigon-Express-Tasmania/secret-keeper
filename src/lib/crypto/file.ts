/**
 * Per-file AES-256-GCM encryption inside the vault archive.
 * Uses a random file DEK (not Argon2id) so open/list stay fast.
 */

import type { JsonValue } from "@/lib/vault/fs"

const NONCE_LEN = 12
const DEK_LEN = 32

/** Copy into a fresh ArrayBuffer-backed view (DOM BufferSource typing). */
function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

/** Generate a fresh 32-byte file DEK. */
export function generateFileDekBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(DEK_LEN))
}

/** Import DEK bytes as a non-extractable AES-GCM CryptoKey. */
export async function importFileDek(bytes: Uint8Array): Promise<CryptoKey> {
  if (bytes.length !== DEK_LEN) {
    throw new Error(`Invalid file DEK length: ${bytes.length}`)
  }
  return crypto.subtle.importKey(
    "raw",
    asBufferSource(bytes),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  )
}

export type EncryptedFilePayload = {
  nonce: string
  ciphertext: string
}

/** Encrypt a JSON value with the file DEK. */
export async function encryptFileJson(
  json: JsonValue,
  key: CryptoKey
): Promise<EncryptedFilePayload> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN))
  const plaintext = new TextEncoder().encode(JSON.stringify(json))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      asBufferSource(plaintext)
    )
  )
  return {
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  }
}

/** Decrypt an encrypted file payload back to JSON. */
export async function decryptFileJson(
  enc: EncryptedFilePayload,
  key: CryptoKey
): Promise<JsonValue> {
  const nonce = asBufferSource(base64ToBytes(enc.nonce))
  const ciphertext = asBufferSource(base64ToBytes(enc.ciphertext))
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      ciphertext
    )
  )
  const text = new TextDecoder().decode(plaintext)
  return JSON.parse(text) as JsonValue
}
