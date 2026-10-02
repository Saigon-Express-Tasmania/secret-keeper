import { describe, expect, it } from "vitest"

import type { OtpAlgorithm } from "@/lib/account/schema"
import { base32Decode, base32Encode } from "@/lib/otp/base32"
import { generateHotp, totpCounter } from "@/lib/otp/otp"

const ascii = (s: string) => new TextEncoder().encode(s)

describe("HOTP (RFC 4226 Appendix D)", () => {
  const secret = ascii("12345678901234567890")
  const expected = [
    "755224", "287082", "359152", "969429", "338314",
    "254676", "287922", "162583", "399871", "520489",
  ]
  it.each(expected.map((code, counter) => [counter, code]))(
    "counter %i → %s",
    (counter, code) => {
      expect(generateHotp(secret, counter as number, 6, "SHA1")).toBe(code)
    }
  )
})

describe("TOTP (RFC 6238 Appendix B)", () => {
  const secrets: Record<OtpAlgorithm, Uint8Array> = {
    SHA1: ascii("12345678901234567890"),
    SHA256: ascii("12345678901234567890123456789012"),
    SHA512: ascii(
      "1234567890123456789012345678901234567890123456789012345678901234"
    ),
  }
  const vectors: [number, OtpAlgorithm, string][] = [
    [59, "SHA1", "94287082"],
    [59, "SHA256", "46119246"],
    [59, "SHA512", "90693936"],
    [1111111109, "SHA1", "07081804"],
    [1111111109, "SHA256", "68084774"],
    [1111111109, "SHA512", "25091201"],
    [1111111111, "SHA1", "14050471"],
    [1111111111, "SHA256", "67062674"],
    [1111111111, "SHA512", "99943326"],
    [1234567890, "SHA1", "89005924"],
    [1234567890, "SHA256", "91819424"],
    [1234567890, "SHA512", "93441116"],
    [2000000000, "SHA1", "69279037"],
    [2000000000, "SHA256", "90698825"],
    [2000000000, "SHA512", "38618901"],
    [20000000000, "SHA1", "65353130"],
    [20000000000, "SHA256", "77737706"],
    [20000000000, "SHA512", "47863826"],
  ]
  it.each(vectors)("T=%i %s → %s", (t, alg, code) => {
    const counter = totpCounter(30, t * 1000)
    expect(generateHotp(secrets[alg], counter, 8, alg)).toBe(code)
  })
})

describe("base32", () => {
  it("round-trips and ignores spaces/padding/case", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(23))
    const encoded = base32Encode(bytes)
    expect(base32Decode(encoded)).toEqual(bytes)
    expect(base32Decode(encoded.toLowerCase().replace(/(.{4})/g, "$1 ") + "==")).toEqual(
      bytes
    )
  })

  it("rejects invalid characters", () => {
    expect(() => base32Decode("ABC1")).toThrow(/Invalid Base32/)
  })
})
