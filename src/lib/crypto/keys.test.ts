import { describe, expect, it } from "vitest"

import {
  emailKek,
  formatKey,
  KeyFormatError,
  makeSlot,
  newRecoveryKey,
  newSecretKey,
  newShare,
  newVaultId,
  newVaultKey,
  openSlot,
  parseKey,
  primaryKek,
  recoveryAuthKey,
  recoveryKek,
  SlotOpenError,
  unwrapPasskeyKey,
  wrapPasskeyKey,
} from "@/lib/crypto/keys"
import { randomBytes, toBase64Url } from "@/shared/bytes"

const vaultId = newVaultId()
const pwKey = randomBytes(32)
const sk = newSecretKey()
const p = newShare()
const e = newShare()
const kp = randomBytes(32)
const r = newRecoveryKey()

describe("KEK derivation", () => {
  it("separates every factor set and slot type", () => {
    const keks = [
      primaryKek(vaultId, pwKey, sk, p),
      primaryKek(vaultId, pwKey, sk, p, kp),
      emailKek(vaultId, pwKey, e),
      emailKek(vaultId, pwKey, e, kp),
      emailKek(vaultId, pwKey, p), // same bytes as P, different slot type
      recoveryKek(vaultId, r),
      recoveryAuthKey(r),
      primaryKek(newVaultId(), pwKey, sk, p),
    ].map((k) => toBase64Url(k))
    expect(new Set(keks).size).toBe(keks.length)
  })

  it("is deterministic", () => {
    expect(primaryKek(vaultId, pwKey, sk, p)).toEqual(primaryKek(vaultId, pwKey, sk, p))
  })

  it("validates factor lengths", () => {
    expect(() => primaryKek(vaultId, pwKey, randomBytes(15), p)).toThrow(/Secret Key/)
    expect(() => recoveryKek(vaultId, randomBytes(16))).toThrow(/Recovery Key/)
  })
})

describe("slots", () => {
  it("wrap and unwrap the vault key", async () => {
    const vk = newVaultKey()
    const kek = primaryKek(vaultId, pwKey, sk, p)
    const slot = await makeSlot("primary", vaultId, kek, vk)
    expect(await openSlot([slot], "primary", vaultId, kek)).toEqual(vk)
  })

  it.each<[string, () => Uint8Array]>([
    ["wrong password key", () => primaryKek(vaultId, randomBytes(32), sk, p)],
    ["wrong Secret Key", () => primaryKek(vaultId, pwKey, newSecretKey(), p)],
    ["wrong server share", () => primaryKek(vaultId, pwKey, sk, newShare())],
    ["missing passkey factor", () => primaryKek(vaultId, pwKey, sk, p)],
  ])("fail with a %s", async (_name, wrongKek) => {
    const vk = newVaultKey()
    const slot = await makeSlot("primary", vaultId, primaryKek(vaultId, pwKey, sk, p, kp), vk)
    await expect(openSlot([slot], "primary", vaultId, wrongKek())).rejects.toBeInstanceOf(
      SlotOpenError
    )
  })

  it("cannot be transplanted to another vault or slot type", async () => {
    const vk = newVaultKey()
    const kek = recoveryKek(vaultId, r)
    const slot = await makeSlot("recovery", vaultId, kek, vk)
    const otherVault = newVaultId()
    await expect(openSlot([slot], "recovery", otherVault, kek)).rejects.toThrow()
    await expect(
      openSlot([{ ...slot, type: "primary" }], "primary", vaultId, kek)
    ).rejects.toThrow()
  })

  it("report a missing slot type", async () => {
    await expect(openSlot([], "email", vaultId, randomBytes(32))).rejects.toThrow(/no email slot/)
  })
})

describe("passkey key wrapping", () => {
  it("round-trips per credential and binds the credential id", async () => {
    const prf = randomBytes(32)
    const entry = await wrapPasskeyKey(vaultId, "cred-1", randomBytes(32), prf, kp)
    expect(await unwrapPasskeyKey(vaultId, entry, prf)).toEqual(kp)
    await expect(unwrapPasskeyKey(vaultId, entry, randomBytes(32))).rejects.toThrow()
    await expect(unwrapPasskeyKey(vaultId, { ...entry, id: "cred-2" }, prf)).rejects.toThrow()
  })
})

describe("Emergency Kit key formats", () => {
  it("round-trip Secret and Recovery Keys", () => {
    const skText = formatKey("SK1", sk)
    expect(skText).toMatch(/^SK1-([A-Z2-7]{5}-){5}[A-Z2-7]{4}$/)
    expect(parseKey("SK1", skText)).toEqual(sk)
    const rkText = formatKey("RK1", r)
    expect(rkText.replace(/^RK1-/, "").replace(/-/g, "")).toHaveLength(55)
    expect(parseKey("RK1", rkText)).toEqual(r)
  })

  it("tolerate case, spacing and look-alike digits", () => {
    const text = formatKey("SK1", sk)
    const sloppy = text.toLowerCase().replace(/-/g, " ").replace(/o/g, "0").replace(/i/g, "1")
    expect(parseKey("SK1", sloppy)).toEqual(sk)
  })

  it("catch typos and wrong key types", () => {
    const text = formatKey("SK1", sk)
    const body = text.slice(4)
    const typo = body[0] === "A" ? "B" + body.slice(1) : "A" + body.slice(1)
    expect(() => parseKey("SK1", typo)).toThrow(KeyFormatError)
    expect(() => parseKey("SK1", formatKey("RK1", r))).toThrow(/length/)
    expect(() => parseKey("RK1", "RK1-!!!")).toThrow(KeyFormatError)
  })
})
