/**
 * Read-only decryptor for the pre-CKV3 formats (CKV2 and CKV1), used only by
 * `ck-file from-legacy` to migrate old vaults and .ckv exports. The pepper
 * (old VITE_VAULT_SALT_KEY) is passed in; it never ships to the browser again.
 *
 * CKV2: "CKV2" ‖ ver(2) ‖ kdf(1) ‖ salt16 ‖ nonce12 ‖ AES-GCM(Argon2id(pw, salt, key=pepper)),
 *       AAD = magic ‖ ver, plaintext = CKZ1 pack.
 * CKV1: same layout with "CKV1"/ver 1, plaintext = flat items JSON.
 */

import { argon2id } from "@noble/hashes/argon2.js"

import { unpackArchive } from "@/lib/crypto/pack"
import { migrateV1ItemsToArchive, type RawVaultArchive } from "@/lib/vault/fs"

const SALT_LEN = 16
const NONCE_LEN = 12
const HEADER_LEN = 4 + 1 + 1 + SALT_LEN + NONCE_LEN
const LEGACY_ARGON2 = { t: 3, m: 65536, p: 1, dkLen: 32 } as const

function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return out
}

function magicOf(blob: Uint8Array): string {
  return new TextDecoder().decode(blob.subarray(0, 4))
}

export function isLegacyBlob(blob: Uint8Array): boolean {
  const magic = magicOf(blob)
  return magic === "CKV2" || magic === "CKV1"
}

export async function decryptLegacyVault(
  blob: Uint8Array,
  password: string,
  pepper: string
): Promise<RawVaultArchive> {
  if (blob.length < HEADER_LEN + 16) throw new Error("Legacy vault file is too short.")
  const magic = magicOf(blob)
  const version = magic === "CKV2" ? 2 : magic === "CKV1" ? 1 : 0
  if (!version) throw new Error("Not a legacy (CKV1/CKV2) vault file.")
  if (blob[4] !== version || blob[5] !== 1) throw new Error("Unsupported legacy header.")
  if (!pepper) throw new Error("The old VITE_VAULT_SALT_KEY (pepper) is required.")

  const raw = argon2id(password, blob.subarray(6, 6 + SALT_LEN), {
    ...LEGACY_ARGON2,
    key: pepper,
  })
  const key = await crypto.subtle.importKey("raw", copy(raw), { name: "AES-GCM" }, false, [
    "decrypt",
  ])
  raw.fill(0)
  const aad = new Uint8Array(5)
  aad.set(new TextEncoder().encode(magic), 0)
  aad[4] = version

  let plaintext: Uint8Array
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: copy(blob.subarray(6 + SALT_LEN, HEADER_LEN)), additionalData: aad },
        key,
        copy(blob.subarray(HEADER_LEN))
      )
    )
  } catch {
    throw new Error("Wrong password or pepper for this legacy vault.")
  }

  if (version === 2) return unpackArchive(plaintext)
  const payload = JSON.parse(new TextDecoder().decode(plaintext)) as {
    version: 1
    updatedAt: string
    items: unknown[]
  }
  if (payload.version !== 1 || !Array.isArray(payload.items)) {
    throw new Error("Invalid legacy CKV1 payload.")
  }
  return migrateV1ItemsToArchive(payload)
}
