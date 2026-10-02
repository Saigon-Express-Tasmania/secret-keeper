import { describe, expect, it } from "vitest"

import {
  bytesEqual,
  concatBytes,
  fromBase64Url,
  readUint32LE,
  toBase64Url,
  toHex,
  writeUint32LE,
} from "./bytes"

describe("base64url", () => {
  it.each([0, 1, 2, 3, 4, 5, 16, 31, 32, 33])("round-trips %i bytes", (length) => {
    const bytes = crypto.getRandomValues(new Uint8Array(length))
    const text = toBase64Url(bytes)
    expect(text).toMatch(/^[A-Za-z0-9_-]*$/)
    expect(fromBase64Url(text)).toEqual(bytes)
  })

  it("matches the standard alphabet mapping", () => {
    expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe("-_-_")
    expect(toBase64Url(new TextEncoder().encode("hi"))).toBe("aGk")
  })

  it("rejects padding, foreign characters and non-canonical tails", () => {
    expect(() => fromBase64Url("aGk=")).toThrow()
    expect(() => fromBase64Url("aG+k")).toThrow()
    expect(() => fromBase64Url("a")).toThrow()
    expect(() => fromBase64Url("aGl")).toThrow() // stray low bits
  })

  it("enforces an expected length", () => {
    expect(() => fromBase64Url(toBase64Url(new Uint8Array(15)), 16)).toThrow(/length/)
    expect(fromBase64Url(toBase64Url(new Uint8Array(16)), 16)).toHaveLength(16)
  })
})

describe("byte helpers", () => {
  it("compares in constant time and handles length mismatch", () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false)
  })

  it("concatenates and encodes u32", () => {
    const out = concatBytes(new Uint8Array([1]), new Uint8Array([2, 3]))
    expect([...out]).toEqual([1, 2, 3])
    const view = new Uint8Array(4)
    writeUint32LE(view, 0, 0xdeadbeef)
    expect(toHex(view)).toBe("efbeadde")
    expect(readUint32LE(view, 0)).toBe(0xdeadbeef)
  })
})
