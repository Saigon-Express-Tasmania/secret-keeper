/**
 * CKZ1 pack format: JSON archive → deflate-raw → byte scramble.
 * Scramble is reversible obfuscation only — real secrecy is AES-GCM (CKV2).
 *
 * Layout before encryption:
 *   "CKZ1" (4) | uncompressedLength uint32 LE (4) | scrambledDeflateBytes
 */

import {
  isRawVaultArchive,
  type RawVaultArchive,
  type VaultArchive,
} from "@/lib/vault/fs"

const MAGIC = new TextEncoder().encode("CKZ1")
const HEADER_LEN = 8 // magic + uint32 LE length

/** Copy into a fresh ArrayBuffer-backed view (DOM BlobPart / BufferSource typing). */
function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

function rotl8(byte: number, shift: number): number {
  const s = shift & 7
  return ((byte << s) | (byte >>> (8 - s))) & 0xff
}

function rotr8(byte: number, shift: number): number {
  const s = shift & 7
  return ((byte >>> s) | (byte << (8 - s))) & 0xff
}

/** Obfuscate deflate bytes so they are not obvious compressed data. */
export function scramble(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    out[i] = rotl8(bytes[i]! ^ ((0x5a + i * 0x9d) & 0xff), (i % 7) + 1)
  }
  return out
}

/** Inverse of scramble. */
export function unscramble(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    out[i] = rotr8(bytes[i]!, (i % 7) + 1) ^ ((0x5a + i * 0x9d) & 0xff)
  }
  return out
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("CompressionStream is not available in this environment")
  }
  const stream = new Blob([asBufferSource(data)])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream is not available in this environment")
  }
  const stream = new Blob([asBufferSource(data)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

function writeUint32LE(view: Uint8Array, offset: number, value: number): void {
  view[offset] = value & 0xff
  view[offset + 1] = (value >>> 8) & 0xff
  view[offset + 2] = (value >>> 16) & 0xff
  view[offset + 3] = (value >>> 24) & 0xff
}

function readUint32LE(view: Uint8Array, offset: number): number {
  return (
    (view[offset]! |
      (view[offset + 1]! << 8) |
      (view[offset + 2]! << 16) |
      (view[offset + 3]! << 24)) >>>
    0
  )
}

/** Pack a VaultArchive into CKZ1 bytes (ready for AES-GCM plaintext). */
export async function packArchive(archive: VaultArchive): Promise<Uint8Array> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(archive))
  const compressed = await deflateRaw(jsonBytes)
  const scrambled = scramble(compressed)

  const out = new Uint8Array(HEADER_LEN + scrambled.length)
  out.set(MAGIC, 0)
  writeUint32LE(out, 4, jsonBytes.length)
  out.set(scrambled, HEADER_LEN)
  return out
}

/**
 * Unpack CKZ1 bytes into a raw archive (v2 plaintext or v3 encrypted).
 * Callers migrate to session v3 via ensureEncryptedArchive.
 */
export async function unpackArchive(bytes: Uint8Array): Promise<RawVaultArchive> {
  if (bytes.length < HEADER_LEN) {
    throw new Error("Invalid CKZ1 pack: too short")
  }
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error("Invalid CKZ1 pack: bad magic")
    }
  }

  const expectedLen = readUint32LE(bytes, 4)
  const scrambled = bytes.subarray(HEADER_LEN)
  const compressed = unscramble(scrambled)
  const jsonBytes = await inflateRaw(compressed)

  if (jsonBytes.length !== expectedLen) {
    throw new Error(
      `Invalid CKZ1 pack: length mismatch (got ${jsonBytes.length}, expected ${expectedLen})`
    )
  }

  const json = new TextDecoder().decode(jsonBytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("Invalid CKZ1 pack: JSON parse failed")
  }

  if (!isRawVaultArchive(parsed)) {
    throw new Error("Invalid vault archive shape")
  }
  return parsed
}
