import { describe, expect, it } from "vitest"

import { derivePasswordKeys, normalizePassword, splitArgonOutput } from "@/lib/crypto/kdf"
import { randomBytes } from "@/shared/bytes"
import type { Ckv3Kdf } from "@/shared/ckv3"

// Lowest allowed cost so the real Argon2 path stays fast in tests.
const cheap: Ckv3Kdf = { alg: "argon2id", v: 19, m: 19_456, t: 1, p: 1, salt: "AAAAAAAAAAAAAAAAAAAAAA" }

describe("password KDF", () => {
  it("normalizes to NFKC", () => {
    // "é" precomposed vs e + combining acute; full-width A vs A
    expect(normalizePassword("café")).toBe(normalizePassword("café"))
    expect(normalizePassword("Ａ")).toBe("A")
  })

  it("derives independent auth and password keys", () => {
    const { authKey, pwKey } = splitArgonOutput(randomBytes(32))
    expect(authKey).toHaveLength(32)
    expect(pwKey).toHaveLength(32)
    expect(authKey).not.toEqual(pwKey)
  })

  it("runs Argon2id and treats equivalent passwords alike", async () => {
    let progressed = false
    const a = await derivePasswordKeys("café", cheap, () => {
      progressed = true
    })
    const b = await derivePasswordKeys("café", cheap)
    const c = await derivePasswordKeys("cafe", cheap)
    expect(a).toEqual(b)
    expect(a.authKey).not.toEqual(c.authKey)
    expect(progressed).toBe(true)
  })

  it("refuses out-of-bounds parameters", async () => {
    await expect(derivePasswordKeys("x", { ...cheap, m: 1024 })).rejects.toThrow()
    await expect(derivePasswordKeys("x", { ...cheap, t: 50 })).rejects.toThrow()
  })
})
