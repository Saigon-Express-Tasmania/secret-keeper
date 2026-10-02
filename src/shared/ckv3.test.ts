import { describe, expect, it } from "vitest"

import { randomBytes, toBase64Url } from "./bytes"
import {
  assembleCkv3,
  containerPrefix,
  DEFAULT_KDF,
  encodeHeader,
  parseCkv3,
  slotStructureHash,
  validateHeader,
  type Ckv3Header,
} from "./ckv3"

const b = (n: number) => toBase64Url(randomBytes(n))

function vaultHeader(overrides: Partial<Ckv3Header> = {}): Ckv3Header {
  return {
    v: 1,
    purpose: "vault",
    vaultId: b(16),
    rev: 1,
    kdf: { alg: "argon2id", v: 19, ...DEFAULT_KDF, salt: b(16) },
    slots: [
      { type: "recovery", n: b(12), ct: b(48) },
      { type: "primary", n: b(12), ct: b(48) },
    ],
    ...overrides,
  }
}

function blobFor(header: Ckv3Header): Uint8Array {
  return assembleCkv3(containerPrefix(encodeHeader(header)), randomBytes(12), randomBytes(64))
}

describe("CKV3 header validation", () => {
  it("accepts a minimal vault header and sorts slots", () => {
    const header = validateHeader(vaultHeader())
    expect(header.slots.map((s) => s.type)).toEqual(["primary", "recovery"])
  })

  it("accepts an export header with only a recovery slot", () => {
    const header = vaultHeader({ purpose: "export" })
    delete header.kdf
    header.slots = header.slots.filter((s) => s.type === "recovery")
    expect(validateHeader(header).purpose).toBe("export")
  })

  it.each<[string, (h: Record<string, unknown>) => void]>([
    ["unknown field", (h) => (h.extra = 1)],
    ["missing primary", (h) => ((h.slots as unknown[]).splice(1, 1))],
    ["duplicate slot", (h) => (h.slots as unknown[]).push((h.slots as unknown[])[0])],
    ["short vault id", (h) => (h.vaultId = b(15))],
    ["rev zero", (h) => (h.rev = 0)],
    ["non-integer rev", (h) => (h.rev = 1.5)],
    ["kdf memory too high", (h) => ((h.kdf as Record<string, unknown>).m = 262_145)],
    ["kdf memory too low", (h) => ((h.kdf as Record<string, unknown>).m = 1024)],
    ["kdf version", (h) => ((h.kdf as Record<string, unknown>).v = 16)],
    ["wrapped key length", (h) => (((h.slots as Record<string, unknown>[])[0]!).ct = b(47))],
    ["requirePasskey without passkeys", (h) => (h.requirePasskey = true)],
    ["requirePasskey false", (h) => (h.requirePasskey = false)],
    ["export with kdf", (h) => (h.purpose = "export")],
  ])("rejects %s", (_name, mutate) => {
    const header = structuredClone(vaultHeader()) as unknown as Record<string, unknown>
    mutate(header)
    expect(() => validateHeader(header)).toThrow(/Invalid vault file/)
  })

  it("validates passkeys", () => {
    const passkey = { id: b(20), salt: b(32), n: b(12), ct: b(48) }
    expect(validateHeader(vaultHeader({ requirePasskey: true, passkeys: [passkey] })).passkeys)
      .toHaveLength(1)
    expect(() => validateHeader(vaultHeader({ passkeys: [passkey, passkey] }))).toThrow()
    expect(() =>
      validateHeader(vaultHeader({ passkeys: [{ ...passkey, salt: b(16) }] }))
    ).toThrow()
  })
})

describe("CKV3 container", () => {
  it("round-trips header, nonce and ciphertext", () => {
    const header = vaultHeader()
    const blob = blobFor(header)
    const parsed = parseCkv3(blob)
    expect(parsed.header).toEqual(validateHeader(header))
    expect(parsed.nonce).toHaveLength(12)
    expect(parsed.ciphertext).toHaveLength(64)
    expect(parsed.aad).toEqual(blob.subarray(0, parsed.aad.byteLength))
  })

  it("rejects wrong magic, format and truncation", () => {
    const blob = blobFor(vaultHeader())
    const badMagic = blob.slice()
    badMagic[0] = 0x41
    expect(() => parseCkv3(badMagic)).toThrow(/not a CKV3/)
    const badFormat = blob.slice()
    badFormat[4] = 2
    expect(() => parseCkv3(badFormat)).toThrow(/format/)
    expect(() => parseCkv3(blob.subarray(0, 40))).toThrow()
  })

  it("rejects a header that is not JSON", () => {
    const blob = blobFor(vaultHeader())
    blob[9] = 0x7b + 1 // corrupt the opening brace
    expect(() => parseCkv3(blob)).toThrow(/JSON/)
  })
})

describe("slot-structure hash", () => {
  it("ignores rev but covers slots, kdf and passkeys", async () => {
    const header = vaultHeader()
    const base = await slotStructureHash(header)
    expect(await slotStructureHash({ ...header, rev: 99 })).toBe(base)
    expect(
      await slotStructureHash({
        ...header,
        slots: [{ ...header.slots[0]!, ct: b(48) }, header.slots[1]!],
      })
    ).not.toBe(base)
    expect(
      await slotStructureHash({ ...header, kdf: { ...header.kdf!, t: 4 } })
    ).not.toBe(base)
    expect(
      await slotStructureHash({
        ...header,
        passkeys: [{ id: b(8), salt: b(32), n: b(12), ct: b(48) }],
      })
    ).not.toBe(base)
  })
})
