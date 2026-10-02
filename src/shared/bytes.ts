/**
 * Byte helpers shared by the browser, the Netlify Function and the CLI.
 * Isomorphic: only standard Web APIs available in browsers and Node 22.
 * Keep relative imports only in src/shared (the function is bundled by esbuild).
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text)
}

export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes)
}

/** Copy into a fresh ArrayBuffer-backed view (BufferSource typing, no aliasing). */
export function toBuffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let length = 0
  for (const part of parts) length += part.byteLength
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

/** Constant-time comparison for equal-length secrets. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  let diff = 0
  for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** Overwrite key material in place (best effort; JS cannot guarantee erasure). */
export function wipe(...buffers: (Uint8Array | null | undefined)[]): void {
  for (const buffer of buffers) buffer?.fill(0)
}

export function writeUint32LE(view: Uint8Array, offset: number, value: number): void {
  view[offset] = value & 0xff
  view[offset + 1] = (value >>> 8) & 0xff
  view[offset + 2] = (value >>> 16) & 0xff
  view[offset + 3] = (value >>> 24) & 0xff
}

export function readUint32LE(view: Uint8Array, offset: number): number {
  return (
    (view[offset]! |
      (view[offset + 1]! << 8) |
      (view[offset + 2]! << 16) |
      (view[offset + 3]! << 24)) >>>
    0
  )
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const B64URL_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1)
  for (let i = 0; i < B64URL.length; i++) table[B64URL.charCodeAt(i)] = i
  return table
})()

/** base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = ""
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out +=
      B64URL[(n >>> 18) & 63]! +
      B64URL[(n >>> 12) & 63]! +
      B64URL[(n >>> 6) & 63]! +
      B64URL[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += B64URL[(n >>> 18) & 63]! + B64URL[(n >>> 12) & 63]!
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out +=
      B64URL[(n >>> 18) & 63]! +
      B64URL[(n >>> 12) & 63]! +
      B64URL[(n >>> 6) & 63]!
  }
  return out
}

/**
 * Strict base64url decode (no padding, no whitespace). When `expectedLength`
 * is given, any other decoded length throws.
 */
export function fromBase64Url(
  text: string,
  expectedLength?: number
): Uint8Array<ArrayBuffer> {
  if (typeof text !== "string" || text.length % 4 === 1) {
    throw new Error("Invalid base64url")
  }
  const out = new Uint8Array(Math.floor((text.length * 3) / 4))
  let bits = 0
  let value = 0
  let o = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const digit = code < 128 ? B64URL_LOOKUP[code]! : -1
    if (digit < 0) throw new Error("Invalid base64url")
    value = (value << 6) | digit
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (value >>> bits) & 0xff
    }
  }
  // Reject non-canonical encodings (stray low bits in the last character).
  if (bits > 0 && (value & ((1 << bits) - 1)) !== 0) {
    throw new Error("Invalid base64url")
  }
  if (expectedLength !== undefined && o !== expectedLength) {
    throw new Error(`Invalid length: expected ${expectedLength} bytes, got ${o}`)
  }
  return out
}

export function toHex(bytes: Uint8Array): string {
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", toBuffer(bytes)))
}
