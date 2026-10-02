import { describe, expect, it } from "vitest"

import {
  acceptByte,
  generatePassword,
  passwordAlphabet,
  randomIndex,
  type FillRandom,
} from "@/lib/security/password"

/** Deterministic source that replays `values`, then repeats the last one. */
function scripted(values: number[]): FillRandom {
  let i = 0
  return (bytes) => {
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] = values[Math.min(i++, values.length - 1)]!
    }
  }
}

describe("randomIndex", () => {
  it("rejects bytes at or above the largest multiple of n", () => {
    // n = 87 → limit = 256 - (256 % 87) = 174; 174..255 must be discarded.
    const fill = scripted([255, 200, 174, 173])
    expect(randomIndex(87, fill)).toBe(173 % 87)
  })

  it("accepts every byte when n divides 256", () => {
    expect(randomIndex(64, scripted([255]))).toBe(255 % 64)
  })

  it.each([passwordAlphabet(true).length, passwordAlphabet(false).length])(
    "maps accepted bytes uniformly for n=%i (no modulo bias)",
    (n) => {
      const counts = new Array<number>(n).fill(0)
      for (let b = 0; b < 256; b++) {
        const index = acceptByte(b, n)
        if (index !== null) counts[index]!++
      }
      expect(new Set(counts).size).toBe(1)
    }
  )

  it("validates n", () => {
    expect(() => randomIndex(0)).toThrow()
    expect(() => randomIndex(257)).toThrow()
  })
})

describe("generatePassword", () => {
  it("uses only the requested alphabet and length", () => {
    const pw = generatePassword(64, false)
    expect(pw).toHaveLength(64)
    expect(pw).toMatch(/^[A-Za-z0-9]+$/)
  })
})
