import { describe, expect, it } from "vitest"

import { randomBytes, toBase64Url, utf8 } from "../src/shared/bytes"
import {
  checkVerifier,
  decodeServerSecret,
  deriveServerKeys,
  fakeKdf,
  makeVerifier,
  seal,
  unseal,
} from "./secrets"

const keysPromise = deriveServerKeys(new Uint8Array(32).fill(1))

describe("server secret", () => {
  it("accepts openssl base64 and base64url", () => {
    const raw = randomBytes(32)
    const std = Buffer.from(raw).toString("base64")
    expect(decodeServerSecret(std)).toEqual(raw)
    expect(decodeServerSecret(toBase64Url(raw))).toEqual(raw)
  })

  it("rejects short secrets", () => {
    expect(() => decodeServerSecret(toBase64Url(randomBytes(16)))).toThrow(/at least/)
  })
})

describe("verifiers", () => {
  it("match only the same kind, vault and credential", async () => {
    const keys = await keysPromise
    const credential = randomBytes(32)
    const stored = makeVerifier(keys, "password", "vid-a", credential)
    expect(stored.startsWith("1.")).toBe(true)
    expect(checkVerifier(keys, stored, "password", "vid-a", credential)).toBe(true)
    expect(checkVerifier(keys, stored, "recovery", "vid-a", credential)).toBe(false)
    expect(checkVerifier(keys, stored, "password", "vid-b", credential)).toBe(false)
    expect(checkVerifier(keys, stored, "password", "vid-a", randomBytes(32))).toBe(false)
    expect(checkVerifier(keys, undefined, "password", "vid-a", credential)).toBe(false)
    expect(checkVerifier(keys, "1.garbage!", "password", "vid-a", credential)).toBe(false)
  })

  it("depend on the server secret", async () => {
    const other = await deriveServerKeys(new Uint8Array(32).fill(2))
    const credential = randomBytes(32)
    const stored = makeVerifier(await keysPromise, "password", "v", credential)
    expect(checkVerifier(other, stored, "password", "v", credential)).toBe(false)
  })
})

describe("sealing", () => {
  it("round-trips and binds the context", async () => {
    const keys = await keysPromise
    const secret = randomBytes(32)
    const sealed = await seal(keys, ["vault", "sp"], secret)
    expect(await unseal(keys, ["vault", "sp"], sealed)).toEqual(secret)
    await expect(unseal(keys, ["vault", "se"], sealed)).rejects.toThrow()
    await expect(unseal(keys, ["other", "sp"], sealed)).rejects.toThrow()
  })

  it("uses a fresh nonce each time", async () => {
    const keys = await keysPromise
    const value = utf8("same")
    expect(await seal(keys, ["a"], value)).not.toBe(await seal(keys, ["a"], value))
  })
})

describe("fake KDF", () => {
  it("is stable per name and looks real", async () => {
    const keys = await keysPromise
    const a = fakeKdf(keys, "alpha")
    expect(fakeKdf(keys, "alpha")).toEqual(a)
    expect(fakeKdf(keys, "beta").salt).not.toBe(a.salt)
    expect(a).toMatchObject({ alg: "argon2id", v: 19, m: 65536, t: 3, p: 1 })
    expect(a.salt).toHaveLength(22) // 16 bytes base64url
  })
})
