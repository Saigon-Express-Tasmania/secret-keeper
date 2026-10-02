/**
 * CKV3 vault files: body encryption, slot assembly, and export files.
 *
 * Body plaintext = u32LE(n) ‖ CKZ1 pack (n bytes) ‖ zero padding to a 16 KiB
 * multiple, so the stored size only reveals the vault size coarsely.
 * AES-256-GCM under bodyKey = HKDF(VK) with AAD = magic ‖ format ‖ header,
 * which authenticates every header field.
 */

import {
  emailKek,
  makeSlot,
  openSlot,
  primaryKek,
  recoveryKek,
  bodyKeyBytes,
} from "@/lib/crypto/keys"
import { packArchive, unpackArchive } from "@/lib/crypto/pack"
import type { RawVaultArchive, VaultArchive } from "@/lib/vault/fs"
import {
  randomBytes,
  readUint32LE,
  toBuffer,
  wipe,
  writeUint32LE,
} from "@/shared/bytes"
import {
  assembleCkv3,
  containerPrefix,
  encodeHeader,
  NONCE_LEN,
  parseCkv3,
  type Ckv3Header,
  type Ckv3Parsed,
  type Ckv3Slot,
} from "@/shared/ckv3"

export const BODY_PAD_BYTES = 16 * 1024

export class VaultFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VaultFileError"
  }
}

export function padBody(pack: Uint8Array): Uint8Array<ArrayBuffer> {
  const length = 4 + pack.byteLength
  const padded = Math.ceil(length / BODY_PAD_BYTES) * BODY_PAD_BYTES
  const body = new Uint8Array(padded)
  writeUint32LE(body, 0, pack.byteLength)
  body.set(pack, 4)
  return body
}

export function unpadBody(body: Uint8Array): Uint8Array {
  if (body.byteLength < 4) throw new VaultFileError("Vault body is truncated.")
  const length = readUint32LE(body, 0)
  if (4 + length > body.byteLength) throw new VaultFileError("Vault body is truncated.")
  return body.subarray(4, 4 + length)
}

async function importBodyKey(vaultKey: Uint8Array, usage: "encrypt" | "decrypt") {
  const raw = bodyKeyBytes(vaultKey)
  try {
    return await crypto.subtle.importKey("raw", toBuffer(raw), { name: "AES-GCM" }, false, [
      usage,
    ])
  } finally {
    wipe(raw)
  }
}

/** Encrypt an archive (with fileDek/keys attached) into a full CKV3 blob. */
export async function sealVaultFile(
  header: Ckv3Header,
  vaultKey: Uint8Array,
  archive: VaultArchive
): Promise<Uint8Array<ArrayBuffer>> {
  const aad = containerPrefix(encodeHeader(header))
  const body = padBody(await packArchive(archive))
  const nonce = randomBytes(NONCE_LEN)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad },
      await importBodyKey(vaultKey, "encrypt"),
      body
    )
  )
  wipe(body)
  return assembleCkv3(aad, nonce, ciphertext)
}

/** Decrypt and unpack the body. Fails if the body or any header byte changed. */
export async function openVaultBody(
  parsed: Ckv3Parsed,
  vaultKey: Uint8Array
): Promise<RawVaultArchive> {
  let body: Uint8Array
  try {
    body = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: parsed.nonce, additionalData: parsed.aad },
        await importBodyKey(vaultKey, "decrypt"),
        parsed.ciphertext
      )
    )
  } catch {
    throw new VaultFileError("The vault file is damaged or was modified.")
  }
  try {
    return await unpackArchive(unpadBody(body))
  } finally {
    wipe(body)
  }
}

// --- Slots ---------------------------------------------------------------------

export type SlotFactors = {
  vaultId: string
  vaultKey: Uint8Array
  pwKey: Uint8Array
  secretKey: Uint8Array
  srvShare: Uint8Array
  /** Present when the vault has an email slot. */
  emailShare?: Uint8Array | null
  /** Present when "require passkey" is on. */
  passkeyKey?: Uint8Array | null
  /** A new Recovery Key, or the existing (unchanged) recovery slot. */
  recovery: { key: Uint8Array } | { slot: Ckv3Slot }
}

/** Build the slot list for a vault header from its factors. */
export async function buildSlots(f: SlotFactors): Promise<Ckv3Slot[]> {
  const kp = f.passkeyKey ?? undefined
  const primary = primaryKek(f.vaultId, f.pwKey, f.secretKey, f.srvShare, kp)
  const slots: Ckv3Slot[] = [await makeSlot("primary", f.vaultId, primary, f.vaultKey)]
  wipe(primary)
  if (f.emailShare) {
    const email = emailKek(f.vaultId, f.pwKey, f.emailShare, kp)
    slots.push(await makeSlot("email", f.vaultId, email, f.vaultKey))
    wipe(email)
  }
  if ("key" in f.recovery) {
    const recovery = recoveryKek(f.vaultId, f.recovery.key)
    slots.push(await makeSlot("recovery", f.vaultId, recovery, f.vaultKey))
    wipe(recovery)
  } else {
    slots.push(f.recovery.slot)
  }
  return slots
}

export async function openPrimarySlot(
  header: Ckv3Header,
  pwKey: Uint8Array,
  secretKey: Uint8Array,
  srvShare: Uint8Array,
  passkeyKey?: Uint8Array
): Promise<Uint8Array> {
  const kek = primaryKek(header.vaultId, pwKey, secretKey, srvShare, passkeyKey)
  try {
    return await openSlot(header.slots, "primary", header.vaultId, kek)
  } finally {
    wipe(kek)
  }
}

export async function openEmailSlot(
  header: Ckv3Header,
  pwKey: Uint8Array,
  emailShare: Uint8Array,
  passkeyKey?: Uint8Array
): Promise<Uint8Array> {
  const kek = emailKek(header.vaultId, pwKey, emailShare, passkeyKey)
  try {
    return await openSlot(header.slots, "email", header.vaultId, kek)
  } finally {
    wipe(kek)
  }
}

export async function openRecoverySlot(
  header: Ckv3Header,
  recoveryKey: Uint8Array
): Promise<Uint8Array> {
  const kek = recoveryKek(header.vaultId, recoveryKey)
  try {
    return await openSlot(header.slots, "recovery", header.vaultId, kek)
  } finally {
    wipe(kek)
  }
}

// --- Export / import files ----------------------------------------------------

/**
 * An export file: purpose "export", the vault's id, VK and recovery slot, and
 * an archive without the recycle bin or vault keys. It opens with the
 * vault's Recovery Key (or directly with VK in the same vault).
 */
export async function sealExportFile(options: {
  vaultId: string
  vaultKey: Uint8Array
  recoverySlot: Ckv3Slot
  archive: VaultArchive
  /** Migration/import files carry the Recycle Bin; in-app exports do not. */
  keepRecycleBin?: boolean
}): Promise<Uint8Array<ArrayBuffer>> {
  const { keys: _keys, ...archive } = options.archive
  const header: Ckv3Header = {
    v: 1,
    purpose: "export",
    vaultId: options.vaultId,
    rev: 1,
    slots: [options.recoverySlot],
  }
  return sealVaultFile(header, options.vaultKey, {
    ...archive,
    recycleBin: options.keepRecycleBin ? (archive.recycleBin ?? []) : [],
  })
}

export type ExportKey = { vaultKey: Uint8Array } | { recoveryKey: Uint8Array }

export async function openExportFile(
  blob: Uint8Array,
  key: ExportKey
): Promise<RawVaultArchive> {
  const parsed = parseCkv3(blob)
  if (parsed.header.purpose !== "export") {
    throw new VaultFileError("This is not an export file.")
  }
  const vaultKey =
    "vaultKey" in key ? key.vaultKey : await openRecoverySlot(parsed.header, key.recoveryKey)
  try {
    return await openVaultBody(parsed, vaultKey)
  } finally {
    if (!("vaultKey" in key)) wipe(vaultKey)
  }
}
