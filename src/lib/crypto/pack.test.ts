import { describe, expect, it } from "vitest"

import { packArchive, scramble, unpackArchive, unscramble } from "@/lib/crypto/pack"
import { createEmptyArchive } from "@/lib/vault/fs"

function setUint32LE(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer, bytes.byteOffset).setUint32(offset, value, true)
}

describe("CKZ1 pack", () => {
  it("round-trips an archive", async () => {
    const archive = createEmptyArchive()
    const packed = await packArchive(archive)
    expect(new TextDecoder().decode(packed.subarray(0, 4))).toBe("CKZ1")
    await expect(unpackArchive(packed)).resolves.toEqual(
      JSON.parse(JSON.stringify(archive))
    )
  })

  it("scramble is reversible", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(1000))
    expect(unscramble(scramble(bytes))).toEqual(bytes)
  })

  it("rejects bad magic", async () => {
    const packed = await packArchive(createEmptyArchive())
    packed[0] = 0
    await expect(unpackArchive(packed)).rejects.toThrow(/bad magic/)
  })

  it("rejects a declared length above the cap without inflating", async () => {
    const packed = await packArchive(createEmptyArchive())
    setUint32LE(packed, 4, 0xffffffff)
    await expect(unpackArchive(packed)).rejects.toThrow(/too large/)
  })

  it("stops inflating once output exceeds the declared length", async () => {
    // Highly compressible 4 MiB payload declared as 1 KiB: a mini zip bomb.
    const json = JSON.stringify({ pad: "a".repeat(4 * 1024 * 1024) })
    const deflated = new Uint8Array(
      await new Response(
        new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"))
      ).arrayBuffer()
    )
    const bomb = new Uint8Array(8 + deflated.length)
    bomb.set(new TextEncoder().encode("CKZ1"), 0)
    setUint32LE(bomb, 4, 1024)
    bomb.set(scramble(deflated), 8)
    await expect(unpackArchive(bomb)).rejects.toThrow(/exceeds declared length/)
  })

  it("rejects a length mismatch", async () => {
    const packed = await packArchive(createEmptyArchive())
    const view = new DataView(packed.buffer, packed.byteOffset)
    setUint32LE(packed, 4, view.getUint32(4, true) + 10)
    await expect(unpackArchive(packed)).rejects.toThrow(/length mismatch/)
  })
})
