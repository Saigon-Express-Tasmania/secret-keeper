import { describe, expect, it } from "vitest"

import { generateHotp } from "../src/lib/otp/otp"
import { maskEmail, verifyTotp } from "./twoFactor"

const secret = new Uint8Array(20).fill(9)
const now = 1_790_000_000
const step = Math.floor(now / 30)
const code = (s: number) => generateHotp(secret, s, 6, "SHA1")

describe("verifyTotp", () => {
  it("accepts the current step and one step of drift either way", () => {
    expect(verifyTotp(secret, code(step), now, 0)).toBe(step)
    expect(verifyTotp(secret, code(step - 1), now, 0)).toBe(step - 1)
    expect(verifyTotp(secret, code(step + 1), now, 0)).toBe(step + 1)
  })

  it("rejects codes further out, malformed codes and used steps", () => {
    for (const s of [step - 2, step + 2]) {
      if (![step - 1, step, step + 1].some((ok) => code(ok) === code(s))) {
        expect(verifyTotp(secret, code(s), now, 0)).toBeNull()
      }
    }
    expect(verifyTotp(secret, ` ${code(step)}`, now, 0)).toBeNull()
    expect(verifyTotp(secret, "12345", now, 0)).toBeNull()
    expect(verifyTotp(secret, code(step), now, step)).toBeNull()
    expect(verifyTotp(secret, code(step + 1), now, step)).toBe(step + 1)
  })
})

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("pat@example.com")).toBe("p•••@example.com")
    expect(maskEmail("@example.com")).toBe("•••")
  })
})
