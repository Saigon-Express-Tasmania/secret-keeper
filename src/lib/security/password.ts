/**
 * Password generation without modulo bias.
 */

const LOWER = "abcdefghijklmnopqrstuvwxyz"
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const DIGITS = "0123456789"
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?"

export type FillRandom = (bytes: Uint8Array<ArrayBuffer>) => void

const defaultFill: FillRandom = (bytes) => {
  crypto.getRandomValues(bytes)
}

/**
 * Map one random byte to an index in [0, n), or null when the byte must be
 * rejected: bytes at or above the largest multiple of n would bias `% n`.
 */
export function acceptByte(b: number, n: number): number | null {
  const limit = 256 - (256 % n)
  return b < limit ? b % n : null
}

/** Uniform index in [0, n) for n ≤ 256 via rejection sampling. */
export function randomIndex(n: number, fill: FillRandom = defaultFill): number {
  if (!Number.isInteger(n) || n < 1 || n > 256) {
    throw new Error(`randomIndex: n must be an integer in 1..256, got ${n}`)
  }
  const buf = new Uint8Array(32)
  for (;;) {
    fill(buf)
    for (const b of buf) {
      const index = acceptByte(b, n)
      if (index !== null) return index
    }
  }
}

export function passwordAlphabet(useSymbols: boolean): string {
  return LOWER + UPPER + DIGITS + (useSymbols ? SYMBOLS : "")
}

export function generatePassword(
  length: number,
  useSymbols: boolean,
  fill: FillRandom = defaultFill
): string {
  const alphabet = passwordAlphabet(useSymbols)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += alphabet[randomIndex(alphabet.length, fill)]!
  }
  return out
}

// --- Master password policy --------------------------------------------------

export const MIN_MASTER_PASSWORD_LENGTH = 12

/**
 * Returns a reason the master password is unacceptable, or null.
 * With a Secret Key and server share in every daily-unlock slot, offline
 * guessing is off the table; this guards the online and server-compromise
 * paths (email unlock) against trivially weak choices.
 */
export function masterPasswordProblem(password: string, vaultName?: string): string | null {
  const normalized = password.normalize("NFKC")
  if ([...normalized].length < MIN_MASTER_PASSWORD_LENGTH) {
    return `Use at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`
  }
  if (/^(.)\1+$/u.test(normalized)) return "Don't repeat a single character."
  if (vaultName && normalized.toLowerCase() === vaultName.toLowerCase()) {
    return "Don't use the vault name as the password."
  }
  return null
}
