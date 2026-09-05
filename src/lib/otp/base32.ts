/**
 * RFC 4648 Base32 (A–Z, 2–7). Spaces and padding `=` are ignored on decode.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function charIndex(c: string): number {
  const upper = c.toUpperCase()
  const i = ALPHABET.indexOf(upper)
  if (i < 0) {
    throw new Error(`Invalid Base32 character: ${c}`)
  }
  return i
}

/** Decode Base32 string to bytes. Throws on invalid alphabet chars. */
export function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/[\s=]/g, "").toUpperCase()
  if (cleaned.length === 0) {
    throw new Error("Empty Base32 secret")
  }
  for (const c of cleaned) {
    if (!ALPHABET.includes(c)) {
      throw new Error(`Invalid Base32 character: ${c}`)
    }
  }

  const out: number[] = []
  let buffer = 0
  let bitsLeft = 0

  for (const c of cleaned) {
    buffer = (buffer << 5) | charIndex(c)
    bitsLeft += 5
    if (bitsLeft >= 8) {
      bitsLeft -= 8
      out.push((buffer >> bitsLeft) & 0xff)
    }
  }

  return new Uint8Array(out)
}

/** Encode bytes as Base32 without padding. */
export function base32Encode(bytes: Uint8Array): string {
  let result = ""
  let buffer = 0
  let bitsLeft = 0

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bitsLeft += 8
    while (bitsLeft >= 5) {
      bitsLeft -= 5
      result += ALPHABET[(buffer >> bitsLeft) & 0x1f]!
    }
  }

  if (bitsLeft > 0) {
    result += ALPHABET[(buffer << (5 - bitsLeft)) & 0x1f]!
  }

  return result
}

/** True if the string is valid Base32 (after stripping spaces/padding). */
export function isValidBase32(input: string): boolean {
  try {
    base32Decode(input)
    return true
  } catch {
    return false
  }
}
