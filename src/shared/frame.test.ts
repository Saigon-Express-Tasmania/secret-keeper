import { describe, expect, it } from "vitest"

import { writeUint32LE } from "./bytes"
import { decodeFrame, encodeFrame, MAX_FRAME_JSON_BYTES } from "./frame"

describe("frames", () => {
  it("round-trips JSON plus blob", () => {
    const blob = crypto.getRandomValues(new Uint8Array(1000))
    const decoded = decodeFrame(encodeFrame({ a: 1, b: "x" }, blob))
    expect(decoded.json).toEqual({ a: 1, b: "x" })
    expect(decoded.blob).toEqual(blob)
  })

  it("allows an empty blob", () => {
    expect(decodeFrame(encodeFrame({ ok: true })).blob).toHaveLength(0)
  })

  it("rejects declared lengths beyond the buffer or the cap", () => {
    const bad = new Uint8Array(8)
    writeUint32LE(bad, 0, 100)
    expect(() => decodeFrame(bad)).toThrow()
    writeUint32LE(bad, 0, MAX_FRAME_JSON_BYTES + 1)
    expect(() => decodeFrame(bad)).toThrow()
    expect(() => decodeFrame(new Uint8Array(2))).toThrow()
  })
})
