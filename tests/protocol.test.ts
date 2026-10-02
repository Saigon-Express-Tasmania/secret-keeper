import { afterEach, describe, expect, it, vi } from "vitest"

import { isApiError } from "@/lib/api/client"
import { encryptFileJson } from "@/lib/crypto/file"
import { parseKey } from "@/lib/crypto/keys"
import { openPrimarySlot } from "@/lib/crypto/vaultFile"
import { loadDevice } from "@/lib/device/deviceStore"
import { putFile } from "@/lib/vault/fs"
import {
  createVault,
  NeedSecretKeyError,
  openDownloadedVault,
  preparePasswordUnlock,
  prepareRecoveryUnlock,
  requestUnlock,
  RollbackError,
  type VaultSession,
} from "@/lib/vault/vaultSession"
import { fromBase64Url } from "@/shared/bytes"
import { parseCkv3 } from "@/shared/ckv3"

import { createBrowser, createTestServer, type Browser } from "./harness"
import { TEST_SETUP_CODE } from "../server/testkit"

const PASSWORD = "correct horse battery staple"

afterEach(() => vi.unstubAllGlobals())

async function addNote(session: VaultSession, path: string, text: string) {
  await session.save(async (archive) => {
    putFile(archive, path, await encryptFileJson({ text }, session.fileDekKey))
  })
}

async function unlockWithPassword(
  browser: Browser,
  vault: string,
  password: string,
  options: { secretKey?: Uint8Array; trustDevice?: boolean; totp?: string } = {}
) {
  browser.activate()
  const pending = await preparePasswordUnlock(browser.deps, vault, password)
  const downloaded = await requestUnlock(browser.deps, pending, {
    trustDevice: options.trustDevice ?? false,
    ...(options.totp ? { totp: options.totp } : {}),
  })
  return (await openDownloadedVault(browser.deps, downloaded, { secretKey: options.secretKey }))
    .session
}

async function setup() {
  const server = await createTestServer()
  const home = createBrowser(server)
  home.activate()
  const { session, kit } = await createVault(home.deps, {
    vault: "Family",
    password: PASSWORD,
    setupCode: TEST_SETUP_CODE,
    trustDevice: true,
  })
  return { server, home, session, kit, secretKey: parseKey("SK1", kit.secretKey) }
}

describe("create", () => {
  it("needs the setup code and an unused name", async () => {
    const { home } = await setup()
    await expect(
      createVault(home.deps, { vault: "other", password: PASSWORD, setupCode: "nope", trustDevice: false })
    ).rejects.toSatisfy((e) => isApiError(e, "bad_setup_code"))
    await expect(
      createVault(home.deps, { vault: "family", password: PASSWORD, setupCode: TEST_SETUP_CODE, trustDevice: false })
    ).rejects.toSatisfy((e) => isApiError(e, "exists"))
  })

  it("stores only ciphertext and an Emergency Kit for the user", async () => {
    const { server, kit } = await setup()
    expect(kit.secretKey).toMatch(/^SK1-/)
    expect(kit.recoveryKey).toMatch(/^RK1-/)
    expect(server.store.keys()).toEqual(["vaults/family.enc"])
    const stored = await server.store.get("vaults/family.enc")
    const text = new TextDecoder("latin1").decode(stored!.body)
    expect(text).not.toContain(PASSWORD)
    expect(Object.keys(stored!.meta).sort()).toEqual(
      ["ae", "av", "bk", "ck", "kdf", "pr", "rev", "rv", "sh", "sp", "vid"].sort()
    )
  })
})

describe("unlock", () => {
  it("asks a new device for the Secret Key, then opens", async () => {
    const { server, session, secretKey } = await setup()
    await addNote(session, "notes/a.json", "hello")
    const laptop = createBrowser(server)
    await expect(unlockWithPassword(laptop, "family", PASSWORD)).rejects.toSatisfy(
      (e) => e instanceof NeedSecretKeyError && e.reason === "missing"
    )
    const opened = await unlockWithPassword(laptop, "family", PASSWORD, { secretKey })
    expect(await opened.decryptFile("notes/a.json")).toEqual({ text: "hello" })
  })

  it("reports a wrong Secret Key distinctly from a wrong password", async () => {
    const { server, secretKey } = await setup()
    const laptop = createBrowser(server)
    const wrong = secretKey.slice()
    wrong[0]! ^= 1
    await expect(
      unlockWithPassword(laptop, "family", PASSWORD, { secretKey: wrong })
    ).rejects.toSatisfy((e) => e instanceof NeedSecretKeyError && e.reason === "wrong")
    await expect(unlockWithPassword(laptop, "family", "wrong password!!")).rejects.toSatisfy(
      (e) => isApiError(e, "bad_credentials")
    )
  })

  it("remembers the Secret Key on a trusted device for 30 days", async () => {
    const { server, home } = await setup()
    const opened = await unlockWithPassword(home, "family", PASSWORD)
    expect(opened.payload.root.entries.notes).toBeDefined()
    server.clock.now += 31 * 24 * 3600 * 1000
    home.activate()
    expect(loadDevice("family", server.clock.now)).toBeNull()
  })

  it("locks the vault after repeated wrong passwords", async () => {
    const { server, secretKey } = await setup()
    const attacker = createBrowser(server)
    const codes: string[] = []
    for (let i = 0; i < 7; i++) {
      try {
        await unlockWithPassword(attacker, "family", `guess number ${i}!!`)
      } catch (error) {
        codes.push(isApiError(error) ? error.code : String(error))
      }
    }
    expect(codes.slice(0, 6)).toEqual(Array(6).fill("bad_credentials"))
    expect(codes[6]).toBe("locked")
    // Even the right password waits out the lock…
    const owner = createBrowser(server)
    await expect(
      unlockWithPassword(owner, "family", PASSWORD, { secretKey })
    ).rejects.toSatisfy((e) => isApiError(e, "locked"))
    server.clock.now += 61_000
    await expect(unlockWithPassword(owner, "family", PASSWORD, { secretKey })).resolves.toBeDefined()
  })

  it("does not reveal whether a vault exists", async () => {
    const { server } = await setup()
    const stranger = createBrowser(server)
    await expect(unlockWithPassword(stranger, "nobody", PASSWORD)).rejects.toSatisfy(
      (e) => isApiError(e, "bad_credentials")
    )
    expect(server.store.keys()).toEqual(["vaults/family.enc"])
  })
})

describe("saving", () => {
  it("replays a save after a conflict from another session", async () => {
    const { server, session, secretKey } = await setup()
    const other = await unlockWithPassword(createBrowser(server), "family", PASSWORD, { secretKey })
    await addNote(other, "notes/from-other.json", "1")
    await addNote(session, "notes/from-home.json", "2")
    expect(Object.keys((session.payload.root.entries.notes as { entries: object }).entries).sort())
      .toEqual(["from-home.json", "from-other.json"])
  })

  it("detects a rollback on a trusted device", async () => {
    const { server, home, session } = await setup()
    const firstVersion = await server.store.get("vaults/family.enc")
    await addNote(session, "notes/a.json", "new")
    await addNote(session, "notes/b.json", "newer")
    // Someone with bucket access puts the old object back.
    await server.store.put("vaults/family.enc", firstVersion!.body, { meta: firstVersion!.meta })
    home.activate()
    const pending = await preparePasswordUnlock(home.deps, "family", PASSWORD)
    const downloaded = await requestUnlock(home.deps, pending, { trustDevice: true })
    await expect(openDownloadedVault(home.deps, downloaded)).rejects.toBeInstanceOf(RollbackError)
  })
})

describe("re-keying", () => {
  it("changes the password, ends other sessions and kills old copies", async () => {
    const { server, session, secretKey } = await setup()
    const other = await unlockWithPassword(createBrowser(server), "family", PASSWORD, { secretKey })
    const oldBlob = (await server.store.get("vaults/family.enc"))!.body
    const oldPending = await preparePasswordUnlock(createBrowser(server).deps, "family", PASSWORD)

    await session.rekey({ proof: { password: PASSWORD }, newPassword: "a brand new passphrase" })

    await expect(addNote(other, "notes/x.json", "x")).rejects.toSatisfy((e) =>
      isApiError(e, "session_expired")
    )
    const laptop = createBrowser(server)
    await expect(unlockWithPassword(laptop, "family", PASSWORD, { secretKey })).rejects.toSatisfy(
      (e) => isApiError(e, "bad_credentials")
    )
    const reopened = await unlockWithPassword(laptop, "family", "a brand new passphrase", { secretKey })
    expect(reopened.header.rev).toBe(session.header.rev)

    // The old blob + old password + Secret Key no longer open: P was rotated.
    const fresh = await requestUnlock(
      laptop.deps,
      await preparePasswordUnlock(laptop.deps, "family", "a brand new passphrase"),
      { trustDevice: false }
    )
    if (oldPending.mode !== "password") throw new Error("unexpected")
    await expect(
      openPrimarySlot(
        parseCkv3(oldBlob).header,
        oldPending.keys.pwKey,
        secretKey,
        fromBase64Url(fresh.meta.srvShare, 32)
      )
    ).rejects.toThrow()
  })

  it("refuses a re-key with the wrong current password", async () => {
    const { session } = await setup()
    await expect(
      session.rekey({ proof: { password: "not my password" }, newPassword: "x".repeat(16) })
    ).rejects.toSatisfy((e) => isApiError(e, "step_up_failed"))
  })

  it("recovers with the Recovery Key and issues a new kit", async () => {
    const { server, session, kit } = await setup()
    await addNote(session, "notes/keep.json", "kept")
    const phone = createBrowser(server)
    phone.activate()
    const recoveryKey = parseKey("RK1", kit.recoveryKey!)
    const pending = prepareRecoveryUnlock("family", recoveryKey)
    const downloaded = await requestUnlock(phone.deps, pending, { trustDevice: false })
    const { session: recovered, mustRekey } = await openDownloadedVault(phone.deps, downloaded)
    expect(mustRekey).toBe(true)
    const { kit: newKit } = await recovered.rekey({
      proof: { recoveryKey },
      newPassword: "recovered passphrase",
      newSecretKey: true,
      newRecoveryKey: true,
    })
    expect(newKit?.secretKey).not.toBe(kit.secretKey)
    const reopened = await unlockWithPassword(createBrowser(server), "family", "recovered passphrase", {
      secretKey: parseKey("SK1", newKit!.secretKey),
    })
    expect(await reopened.decryptFile("notes/keep.json")).toEqual({ text: "kept" })
    // The old Recovery Key is dead.
    await expect(
      requestUnlock(phone.deps, prepareRecoveryUnlock("family", recoveryKey), { trustDevice: false })
    ).rejects.toSatisfy((e) => isApiError(e, "bad_credentials"))
  })

  it("rotates every key and still opens the files", async () => {
    const { server, session } = await setup()
    await addNote(session, "notes/a.json", "secret")
    const { kit } = await session.rekey({ proof: { password: PASSWORD }, rotateVaultKey: true })
    expect(kit?.recoveryKey).toMatch(/^RK1-/)
    expect(await session.decryptFile("notes/a.json")).toEqual({ text: "secret" })
    const reopened = await unlockWithPassword(createBrowser(server), "family", PASSWORD, {
      secretKey: parseKey("SK1", kit!.secretKey),
    })
    expect(await reopened.decryptFile("notes/a.json")).toEqual({ text: "secret" })
  })
})

describe("export and import", () => {
  it("moves files between vaults with the Recovery Key", async () => {
    const { server, home, session, kit } = await setup()
    await addNote(session, "notes/a.json", "exported")
    const file = await session.exportFile()

    home.activate()
    const { session: second } = await createVault(home.deps, {
      vault: "work",
      password: PASSWORD,
      setupCode: TEST_SETUP_CODE,
      trustDevice: false,
    })
    await expect(second.importFile(file, null)).rejects.toThrow(/another vault/)
    const result = await second.importFile(file, parseKey("RK1", kit.recoveryKey!))
    expect(await second.decryptFile(`${result.folderPath}/notes/a.json`)).toEqual({ text: "exported" })

    // Re-import into the same vault needs no key.
    const again = await session.importFile(file, null)
    expect(again.files).toBe(1)
    expect(server.store.keys()).toContain("vaults/work.enc")
  })
})
