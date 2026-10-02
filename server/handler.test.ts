import { describe, expect, it } from "vitest"

import type { ApiErrorBody, PreloginResponse } from "../src/shared/api"
import { encodeAuthRecord } from "./authRecord"
import { apiRequest, createTestServer, TEST_ORIGIN } from "./testkit"

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as ApiErrorBody).error.code
}

describe("request guards", () => {
  it("requires the client header", async () => {
    const { handler } = await createTestServer()
    const request = new Request(`${TEST_ORIGIN}/api/vault/prelogin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vault: "x" }),
    })
    const response = await handler(request)
    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe("bad_request")
  })

  it("rejects cross-origin and cross-site requests", async () => {
    const { handler } = await createTestServer()
    const foreign = await handler(
      apiRequest("prelogin", { json: { vault: "x" }, headers: { origin: "https://evil.test" } })
    )
    expect(foreign.status).toBe(403)
    expect(await errorCode(foreign)).toBe("bad_origin")
    const site = await handler(
      apiRequest("prelogin", { json: { vault: "x" }, headers: { "sec-fetch-site": "cross-site" } })
    )
    expect(site.status).toBe(403)
  })

  it("answers unknown routes and methods", async () => {
    const { handler } = await createTestServer()
    expect((await handler(apiRequest("nope", { json: {} }))).status).toBe(404)
    const wrongMethod = await handler(apiRequest("prelogin", { method: "GET" }))
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get("allow")).toBe("POST")
  })

  it("sets security headers and requires JSON", async () => {
    const { handler } = await createTestServer()
    const response = await handler(
      apiRequest("prelogin", { body: "vault=x", contentType: "application/x-www-form-urlencoded" })
    )
    expect(response.status).toBe(415)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("rejects oversized bodies", async () => {
    const { handler } = await createTestServer()
    const response = await handler(
      apiRequest("prelogin", { json: { vault: "x", pad: "a".repeat(20_000) } })
    )
    expect(response.status).toBe(413)
  })
})

describe("prelogin", () => {
  it("returns stable fake params for unknown vaults", async () => {
    const { handler } = await createTestServer()
    const one = (await (await handler(apiRequest("prelogin", { json: { vault: "Ghost" } }))).json()) as PreloginResponse
    const two = (await (await handler(apiRequest("prelogin", { json: { vault: "ghost" } }))).json()) as PreloginResponse
    expect(one).toEqual(two)
    expect(Object.keys(one.kdf).sort()).toEqual(["alg", "m", "p", "salt", "t", "v"])
  })

  it("returns the stored params for a real vault", async () => {
    const { handler, store } = await createTestServer()
    const kdf = { alg: "argon2id", v: 19, m: 65536, t: 3, p: 1, salt: "BBBBBBBBBBBBBBBBBBBBBA" } as const
    await store.put("vaults/real.enc", new Uint8Array(1), {
      meta: encodeAuthRecord({
        vid: "AAAAAAAAAAAAAAAAAAAAAA",
        rev: 1,
        kdf,
        sh: "h",
        av: "1.a",
        rv: "1.r",
        sp: "1.s",
        ae: 1,
        bk: 0,
        pr: 0,
      }),
    })
    const response = await handler(apiRequest("prelogin", { json: { vault: "real" } }))
    expect(((await response.json()) as PreloginResponse).kdf).toEqual(kdf)
  })

  it("rejects invalid names", async () => {
    const { handler } = await createTestServer()
    const response = await handler(apiRequest("prelogin", { json: { vault: "../x" } }))
    expect(response.status).toBe(400)
  })
})
