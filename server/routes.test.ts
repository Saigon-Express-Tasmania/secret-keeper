import { afterEach, describe, expect, it, vi } from "vitest"

import { encryptFileJson } from "@/lib/crypto/file"
import { putFile } from "@/lib/vault/fs"
import { parseKey } from "@/lib/crypto/keys"
import {
  createVault,
  openDownloadedVault,
  preparePasswordUnlock,
  requestUnlock,
  type VaultSession,
} from "@/lib/vault/vaultSession"
import type { ApiErrorBody } from "@/shared/api"
import { fromBase64Url } from "@/shared/bytes"
import { containerPrefix, encodeHeader, parseCkv3 } from "@/shared/ckv3"
import { encodeFrame, FRAME_CONTENT_TYPE } from "@/shared/frame"

import { createBrowser } from "../tests/harness"
import { decodeAuthRecord } from "./authRecord"
import { apiRequest, createTestServer, TEST_SETUP_CODE } from "./testkit"

afterEach(() => vi.unstubAllGlobals())

async function setup(overrides = {}) {
  const server = await createTestServer(overrides)
  const browser = createBrowser(server)
  browser.activate()
  const { session, kit } = await createVault(browser.deps, {
    vault: "routes",
    password: "a long enough password",
    setupCode: TEST_SETUP_CODE,
    trustDevice: false,
  })
  const token = (session as unknown as { state: { session: string } }).state.session
  const reopen = async () => {
    const pending = await preparePasswordUnlock(browser.deps, "routes", "a long enough password")
    const downloaded = await requestUnlock(browser.deps, pending, { trustDevice: false })
    const opened = await openDownloadedVault(browser.deps, downloaded, {
      secretKey: parseKey("SK1", kit.secretKey),
    })
    return opened.session
  }
  return { server, session, token, reopen }
}

function put(token: string, json: unknown, blob: Uint8Array) {
  return apiRequest("blob", {
    method: "PUT",
    body: encodeFrame(json, blob),
    contentType: FRAME_CONTENT_TYPE,
    headers: { authorization: `Bearer ${token}` },
  })
}

async function code(response: Response) {
  return ((await response.json()) as ApiErrorBody).error.code
}

/** Re-wrap a stored blob with a modified header (body becomes undecryptable, which the server cannot see). */
function withHeader(blob: Uint8Array, change: (h: ReturnType<typeof parseCkv3>["header"]) => void) {
  const parsed = parseCkv3(blob)
  const header = structuredClone(parsed.header)
  change(header)
  const aad = containerPrefix(encodeHeader(header))
  const out = new Uint8Array(aad.length + parsed.nonce.length + parsed.ciphertext.length)
  out.set(aad, 0)
  out.set(parsed.nonce, aad.length)
  out.set(parsed.ciphertext, aad.length + parsed.nonce.length)
  return out
}

describe("PUT /blob guards", () => {
  it("rejects stale etags, wrong revisions and silent slot changes", async () => {
    const { server, token } = await setup()
    const current = (await server.store.get("vaults/routes.enc"))!
    const nextRev = withHeader(current.body, (h) => (h.rev = 2))

    const stale = await server.handler(put(token, { ifMatch: '"old"' }, nextRev))
    expect(stale.status).toBe(409)
    expect(await code(stale)).toBe("conflict")

    const sameRev = withHeader(current.body, () => {})
    const wrongRev = await server.handler(put(token, { ifMatch: current.etag }, sameRev))
    expect(await code(wrongRev)).toBe("bad_blob")

    const swapped = withHeader(current.body, (h) => {
      h.rev = 2
      h.slots[0]!.ct = h.slots[1]!.ct
    })
    const silent = await server.handler(put(token, { ifMatch: current.etag }, swapped))
    expect(silent.status).toBe(400)
    expect(await code(silent)).toBe("bad_blob")
  })

  it("rejects requests without a valid session", async () => {
    const { server, token } = await setup()
    const current = (await server.store.get("vaults/routes.enc"))!
    const forged = token.slice(0, -4) + "AAAA"
    const response = await server.handler(put(forged, { ifMatch: current.etag }, current.body))
    expect(await code(response)).toBe("session_expired")
    const get = await server.handler(apiRequest("blob", { method: "GET" }))
    expect(get.status).toBe(401)
  })

  it("rejects a re-key without step-up proof and counts it toward lockout", async () => {
    const { server, token } = await setup()
    const current = (await server.store.get("vaults/routes.enc"))!
    const blob = withHeader(current.body, (h) => (h.rev = 2))
    const bad = await server.handler(
      put(
        token,
        {
          ifMatch: current.etag,
          rekey: { proof: { authKey: "A".repeat(43) }, srvShare: "A".repeat(43), emailShare: null },
        },
        blob
      )
    )
    expect(await code(bad)).toBe("step_up_failed")
    const meta = JSON.parse(new TextDecoder().decode((await server.store.get("meta/routes.json"))!.body))
    expect(meta.lock.fails).toBe(1)
  })
})

describe("backups", () => {
  it("copies the previous version when due and prunes old copies", async () => {
    const { server, session: first, reopen } = await setup({ backupIntervalHours: 1 })
    let session: VaultSession = first
    const add = (name: string) =>
      session.save(async (archive) => {
        putFile(archive, `notes/${name}.json`, await encryptFileJson({ name }, session.fileDekKey))
      })
    await add("a") // first backup is due immediately (none yet)
    server.clock.now += 30 * 60_000
    await add("b") // not due
    server.clock.now += 31 * 60_000
    await add("c") // due again
    const backups = await server.store.list("backups/routes/")
    expect(backups).toHaveLength(2)
    const oldest = await server.store.get(backups[0]!)
    expect(decodeAuthRecord(oldest!.meta)?.rev).toBe(1)

    // Ten days later: backups older than retention go, but the newest 3 stay.
    for (let i = 0; i < 3; i++) {
      server.clock.now += 2 * 3600_000
      await add(`d${i}`)
    }
    server.clock.now += 10 * 24 * 3600_000
    session = await reopen() // the 12 h session expired meanwhile
    await add("e")
    expect((await server.store.list("backups/routes/")).length).toBe(3)
  })
})

describe("create guards", () => {
  it("is disabled without a setup code", async () => {
    const server = await createTestServer({ setupCode: null })
    const browser = createBrowser(server)
    browser.activate()
    await expect(
      createVault(browser.deps, {
        vault: "x",
        password: "a long enough password",
        setupCode: "anything",
        trustDevice: false,
      })
    ).rejects.toSatisfy((e) => (e as { code?: string }).code === "setup_disabled")
  })

  it("keeps the server share sealed at rest", async () => {
    const { server } = await setup()
    const record = decodeAuthRecord((await server.store.head("vaults/routes.enc"))!.meta)!
    expect(record.sp.startsWith("1.")).toBe(true)
    // A sealed share is nonce ‖ ciphertext ‖ tag: 12 + 32 + 16 bytes.
    expect(fromBase64Url(record.sp.slice(2))).toHaveLength(60)
  })
})
