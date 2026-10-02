/**
 * Authenticator-app TOTP and trusted devices, end to end: real client
 * modules against the real handler, one cookie jar per browser.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { isApiError } from "@/lib/api/client"
import { parseKey } from "@/lib/crypto/keys"
import { loadDevice } from "@/lib/device/deviceStore"
import { base32Encode } from "@/lib/otp/base32"
import { generateHotp } from "@/lib/otp/otp"
import {
  createVault,
  openDownloadedVault,
  preparePasswordUnlock,
  recoveryProof,
  requestUnlock,
  type VaultSession,
} from "@/lib/vault/vaultSession"
import type { AccountStatus } from "@/shared/api"

import { TEST_SETUP_CODE } from "../server/testkit"
import { createBrowser, createTestServer, type Browser } from "./harness"

const PASSWORD = "correct horse battery staple"
const VAULT = "family"
const SECRET = new Uint8Array(20).map((_, i) => i * 7 + 1)
const DAY_MS = 24 * 3600 * 1000

afterEach(() => vi.unstubAllGlobals())

function codeAt(ms: number, stepOffset = 0, secret = SECRET): string {
  return generateHotp(secret, Math.floor(ms / 30_000) + stepOffset, 6, "SHA1")
}

/** A six-digit code that is not valid anywhere in the ±1 step window. */
function wrongCodeAt(ms: number): string {
  const valid = new Set([-1, 0, 1].map((offset) => codeAt(ms, offset)))
  for (let i = 0; ; i++) {
    const candidate = String(i * 111_111 + 123_456).slice(-6).padStart(6, "0")
    if (!valid.has(candidate)) return candidate
  }
}

async function setup() {
  const server = await createTestServer()
  const home = createBrowser(server)
  home.activate()
  const { session, kit } = await createVault(home.deps, {
    vault: VAULT,
    password: PASSWORD,
    setupCode: TEST_SETUP_CODE,
    trustDevice: true,
  })
  return { server, home, session, kit, secretKey: parseKey("SK1", kit.secretKey) }
}

type Setup = Awaited<ReturnType<typeof setup>>

async function unlock(
  browser: Browser,
  options: { secretKey?: Uint8Array; totp?: string; trustDevice?: boolean; password?: string } = {}
): Promise<VaultSession> {
  browser.activate()
  const pending = await preparePasswordUnlock(browser.deps, VAULT, options.password ?? PASSWORD)
  const downloaded = await requestUnlock(browser.deps, pending, {
    trustDevice: options.trustDevice ?? false,
    deviceLabel: "Test browser",
    ...(options.totp ? { totp: options.totp } : {}),
  })
  return (await openDownloadedVault(browser.deps, downloaded, { secretKey: options.secretKey }))
    .session
}

async function enableTotp(
  s: Setup,
  session: VaultSession,
  browser: Browser,
  trustDevice = true
): Promise<AccountStatus> {
  browser.activate()
  const status = await session.accountRequest<AccountStatus>({
    op: "totp.enable",
    proof: await session.passwordProof(PASSWORD),
    secret: base32Encode(SECRET),
    code: codeAt(s.server.clock.now),
    trustDevice,
    deviceLabel: "Enrolling browser",
  })
  session.applyAccountStatus(status, { rememberSecretKey: trustDevice })
  return status
}

const needsCode = (e: unknown) =>
  isApiError(e, "second_factor_required") && e.methods?.join() === "totp"

describe("TOTP enrollment", () => {
  it("needs the master password and a working code", async () => {
    const s = await setup()
    const request = {
      op: "totp.enable" as const,
      secret: base32Encode(SECRET),
      code: codeAt(s.server.clock.now),
    }
    await expect(
      s.session.accountRequest({ ...request, proof: await s.session.passwordProof("not it at all") })
    ).rejects.toSatisfy((e) => isApiError(e, "step_up_failed"))
    await expect(
      s.session.accountRequest({
        ...request,
        code: wrongCodeAt(s.server.clock.now),
        proof: await s.session.passwordProof(PASSWORD),
      })
    ).rejects.toSatisfy((e) => isApiError(e, "bad_second_factor"))
    await expect(
      s.session.accountRequest({
        ...request,
        secret: base32Encode(SECRET.slice(0, 10)),
        proof: await s.session.passwordProof(PASSWORD),
      })
    ).rejects.toSatisfy((e) => isApiError(e, "bad_request"))

    const status = await enableTotp(s, s.session, s.home)
    expect(status.totp).toBe(true)
    expect(status.devices).toEqual([
      expect.objectContaining({ label: "Enrolling browser", current: true }),
    ])
    expect(s.session.account.totp).toBe(true)
    expect(s.session.device.trusted).toBe(true)
  })

  it("refuses to replace an active secret", async () => {
    const s = await setup()
    await enableTotp(s, s.session, s.home)
    s.server.clock.now += 30_000
    await expect(enableTotp(s, s.session, s.home)).rejects.toSatisfy((e) =>
      isApiError(e, "conflict")
    )
  })
})

describe("unlocking with TOTP on", () => {
  it("asks untrusted devices for a fresh code and refuses replays", async () => {
    const s = await setup()
    await enableTotp(s, s.session, s.home)
    const laptop = createBrowser(s.server)
    await expect(unlock(laptop, { secretKey: s.secretKey })).rejects.toSatisfy(needsCode)
    await expect(
      unlock(laptop, { secretKey: s.secretKey, totp: wrongCodeAt(s.server.clock.now) })
    ).rejects.toSatisfy((e) => isApiError(e, "bad_second_factor"))

    s.server.clock.now += 30_000
    const code = codeAt(s.server.clock.now)
    await expect(unlock(laptop, { secretKey: s.secretKey, totp: code })).resolves.toBeDefined()
    const phone = createBrowser(s.server)
    await expect(unlock(phone, { secretKey: s.secretKey, totp: code })).rejects.toSatisfy((e) =>
      isApiError(e, "bad_second_factor")
    )
    s.server.clock.now += 30_000
    await expect(
      unlock(phone, { secretKey: s.secretKey, totp: codeAt(s.server.clock.now) })
    ).resolves.toBeDefined()
  })

  it("lets a trusted device skip the code for a fixed 30 days", async () => {
    const s = await setup()
    await enableTotp(s, s.session, s.home)
    await expect(unlock(s.home)).resolves.toBeDefined()

    const laptop = createBrowser(s.server)
    s.server.clock.now += 30_000
    await unlock(laptop, {
      secretKey: s.secretKey,
      totp: codeAt(s.server.clock.now),
      trustDevice: true,
    })
    const opened = await unlock(laptop) // Secret Key remembered, code skipped
    expect(opened.device.trusted).toBe(true)

    s.server.clock.now += 30 * DAY_MS
    await expect(unlock(s.home, { secretKey: s.secretKey })).rejects.toSatisfy(needsCode)
    await expect(unlock(laptop, { secretKey: s.secretKey })).rejects.toSatisfy(needsCode)
  })

  it("does not trust a device without a real second factor", async () => {
    const s = await setup()
    const laptop = createBrowser(s.server)
    await unlock(laptop, { secretKey: s.secretKey, trustDevice: true })
    expect(laptop.cookies.size).toBe(0)
  })

  it("revokes a stolen device cookie after five wrong passwords", async () => {
    const s = await setup()
    await enableTotp(s, s.session, s.home)
    const thief = createBrowser(s.server)
    for (const [name, value] of s.home.cookies) thief.cookies.set(name, value)
    for (let i = 0; i < 5; i++) {
      await expect(
        unlock(thief, { secretKey: s.secretKey, password: `guess number ${i}!` })
      ).rejects.toSatisfy((e) => isApiError(e, "bad_credentials"))
    }
    await expect(unlock(thief, { secretKey: s.secretKey })).rejects.toSatisfy(needsCode)
    // The guesses used the device's own counter, so the vault is not locked.
    await expect(
      unlock(createBrowser(s.server), { secretKey: s.secretKey, totp: codeAt(s.server.clock.now, 1) })
    ).resolves.toBeDefined()
  })
})

describe("turning TOTP off", () => {
  it("needs a current code with the password, and counts wrong codes", async () => {
    const s = await setup()
    await enableTotp(s, s.session, s.home)
    const proof = () => s.session.passwordProof(PASSWORD)
    await expect(s.session.accountRequest({ op: "totp.disable", proof: await proof() })).rejects
      .toSatisfy((e) => isApiError(e, "bad_second_factor"))
    for (let i = 0; i < 5; i++) {
      await expect(
        s.session.accountRequest({
          op: "totp.disable",
          proof: await proof(),
          code: wrongCodeAt(s.server.clock.now),
        })
      ).rejects.toSatisfy((e) => isApiError(e, "bad_second_factor"))
    }
    // Six failures in a row: locked even with the right code.
    await expect(
      s.session.accountRequest({
        op: "totp.disable",
        proof: await proof(),
        code: codeAt(s.server.clock.now, 1),
      })
    ).rejects.toSatisfy((e) => isApiError(e, "locked"))

    s.server.clock.now += 61_000
    const status = await s.session.accountRequest<AccountStatus>({
      op: "totp.disable",
      proof: await proof(),
      code: codeAt(s.server.clock.now),
    })
    expect(status.totp).toBe(false)
    await expect(unlock(createBrowser(s.server), { secretKey: s.secretKey })).resolves.toBeDefined()
  })

  it("accepts the Recovery Key alone (lost phone)", async () => {
    const s = await setup()
    await enableTotp(s, s.session, s.home)
    const status = await s.session.accountRequest<AccountStatus>({
      op: "totp.disable",
      proof: recoveryProof(parseKey("RK1", s.kit.recoveryKey!)),
    })
    expect(status.totp).toBe(false)
  })

  it("re-enrolling ends trust on every other device", async () => {
    const s = await setup()
    await enableTotp(s, s.session, s.home)
    const laptop = createBrowser(s.server)
    s.server.clock.now += 30_000
    const laptopSession = await unlock(laptop, {
      secretKey: s.secretKey,
      totp: codeAt(s.server.clock.now),
      trustDevice: true,
    })
    s.server.clock.now += 30_000
    s.home.activate()
    await s.session.accountRequest({
      op: "totp.disable",
      proof: await s.session.passwordProof(PASSWORD),
      code: codeAt(s.server.clock.now),
    })
    s.server.clock.now += 30_000
    const status = await enableTotp(s, laptopSession, laptop)
    expect(status.devices.map((d) => d.current)).toEqual([true])
    await expect(unlock(laptop)).resolves.toBeDefined()
    await expect(unlock(s.home)).rejects.toSatisfy(needsCode)
  })
})

describe("trusted devices", () => {
  it("lists and revokes devices", async () => {
    const s = await setup()
    await enableTotp(s, s.session, s.home)
    const laptop = createBrowser(s.server)
    s.server.clock.now += 30_000
    await unlock(laptop, { secretKey: s.secretKey, totp: codeAt(s.server.clock.now), trustDevice: true })

    s.home.activate()
    const listed = await s.session.accountRequest<AccountStatus>({ op: "status" })
    expect(listed.devices).toHaveLength(2)
    const other = listed.devices.find((d) => !d.current)!
    expect(other.label).toBe("Test browser")
    expect(other.exp - other.created).toBe(30 * 24 * 3600)

    const proof = await s.session.passwordProof(PASSWORD)
    const afterOne = await s.session.accountRequest<AccountStatus>({
      op: "devices.revoke",
      proof,
      id: other.id,
    })
    expect(afterOne.devices.map((d) => d.current)).toEqual([true])
    await expect(unlock(laptop)).rejects.toSatisfy(needsCode)

    s.home.activate()
    const afterAll = await s.session.accountRequest<AccountStatus>({
      op: "devices.revoke",
      proof,
      id: "all",
    })
    expect(afterAll.devices).toEqual([])
    expect(s.home.cookies.size).toBe(0)
  })

  it("remembers the Secret Key only when trust is turned on from the settings", async () => {
    const s = await setup()
    const laptop = createBrowser(s.server)
    const session = await unlock(laptop, { secretKey: s.secretKey })
    expect(loadDevice(VAULT, s.server.clock.now)).toBeNull()
    await enableTotp(s, session, laptop)
    laptop.activate()
    expect(loadDevice(VAULT, s.server.clock.now)).not.toBeNull()

    // A plain status refresh never writes the Secret Key to storage.
    const phone = createBrowser(s.server)
    s.server.clock.now += 30_000
    const phoneSession = await unlock(phone, {
      secretKey: s.secretKey,
      totp: codeAt(s.server.clock.now),
      trustDevice: true,
    })
    phone.storage.clear()
    phoneSession.applyAccountStatus(await phoneSession.accountRequest<AccountStatus>({ op: "status" }))
    expect(phoneSession.device.trusted).toBe(true)
    expect(loadDevice(VAULT, s.server.clock.now)).toBeNull()
  })

  it("forgets this device without any other credential", async () => {
    const s = await setup()
    await enableTotp(s, s.session, s.home)
    s.home.activate()
    await s.home.deps.api.forgetDevice(VAULT)
    expect(s.home.cookies.size).toBe(0)
    await expect(unlock(s.home)).rejects.toSatisfy(needsCode)
  })
})

describe("password check", () => {
  it("verifies the master password on the server", async () => {
    const s = await setup()
    await expect(s.session.verifyPassword("not my password")).rejects.toSatisfy((e) =>
      isApiError(e, "step_up_failed")
    )
    await expect(s.session.verifyPassword(PASSWORD)).resolves.toBeUndefined()
  })
})
