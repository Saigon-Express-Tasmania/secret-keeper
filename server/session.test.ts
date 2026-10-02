import { describe, expect, it } from "vitest"

import {
  deviceCookieName,
  hashDeviceSecret,
  newDeviceToken,
  parseDeviceToken,
  readCookie,
  serializeCookie,
} from "./cookies"
import { deriveServerKeys } from "./secrets"
import { bearerToken, issueSession, verifySession } from "./session"

const keysPromise = deriveServerKeys(new Uint8Array(32).fill(3))
const claims = { n: "vault", vid: "abc", ae: 2, exp: 2_000 }

describe("session tokens", () => {
  it("verify until expiry", async () => {
    const keys = await keysPromise
    const token = issueSession(keys, claims)
    expect(verifySession(keys, token, 1_999)).toEqual(claims)
    expect(verifySession(keys, token, 2_000)).toBeNull()
  })

  it("reject tampering and foreign keys", async () => {
    const keys = await keysPromise
    const token = issueSession(keys, claims)
    const [prefix, payload, tag] = token.split(".") as [string, string, string]
    const forged = Buffer.from(JSON.stringify({ ...claims, ae: 3 })).toString("base64url")
    expect(verifySession(keys, `${prefix}.${forged}.${tag}`, 0)).toBeNull()
    expect(verifySession(keys, `${prefix}.${payload}.${tag.slice(0, -2)}AA`, 0)).toBeNull()
    expect(verifySession(keys, "s2." + token.slice(3), 0)).toBeNull()
    const other = await deriveServerKeys(new Uint8Array(32).fill(4))
    expect(verifySession(other, token, 0)).toBeNull()
    expect(verifySession(keys, null, 0)).toBeNull()
  })

  it("reads bearer tokens", () => {
    const request = new Request("https://x.test", {
      headers: { authorization: "Bearer s1.a.b" },
    })
    expect(bearerToken(request)).toBe("s1.a.b")
    expect(bearerToken(new Request("https://x.test"))).toBeNull()
  })
})

describe("device cookies", () => {
  it("use __Host- only on https", () => {
    expect(deviceCookieName("vault", true)).toMatch(/^__Host-ckd-[0-9a-f]{16}$/)
    expect(deviceCookieName("vault", false)).toMatch(/^ckd-[0-9a-f]{16}$/)
    expect(deviceCookieName("a", true)).not.toBe(deviceCookieName("b", true))
  })

  it("serialize strict, http-only attributes", () => {
    const header = serializeCookie("n", "v", { secure: true, maxAge: 60 })
    expect(header).toBe("n=v; Path=/; HttpOnly; SameSite=Strict; Max-Age=60; Secure")
    expect(serializeCookie("n", "v", { secure: false, maxAge: 0 })).not.toMatch(/Secure/)
  })

  it("round-trip tokens and parse cookie headers", () => {
    const token = newDeviceToken()
    const name = deviceCookieName("vault", true)
    const header = `other=1; ${name}=${token.value}; x=y`
    const parsed = parseDeviceToken(readCookie(header, name))
    expect(parsed?.id).toBe(token.id)
    expect(hashDeviceSecret(parsed!.secret)).toBe(hashDeviceSecret(token.secret))
    expect(parseDeviceToken("garbage")).toBeNull()
    expect(parseDeviceToken(`${token.value}.extra`)).toBeNull()
    expect(readCookie(null, name)).toBeNull()
  })
})
