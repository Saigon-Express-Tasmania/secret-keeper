/**
 * "Require passkey": the passkey key KP joins the primary and email slots,
 * and each enrolled passkey wraps KP under its PRF output. A software HMAC
 * authenticator stands in for WebAuthn PRF.
 */

import { hmac } from "@noble/hashes/hmac.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { afterEach, describe, expect, it, vi } from "vitest"

import { parseKey } from "@/lib/crypto/keys"
import {
  createVault,
  NeedPasskeyError,
  NeedSecretKeyError,
  openDownloadedVault,
  preparePasswordUnlock,
  prepareRecoveryUnlock,
  rememberPasskey,
  requestEmailLink,
  requestUnlock,
  WrongPasskeyError,
  type OpenOptions,
  type PasskeyEnrollment,
  type PasskeyProvider,
} from "@/lib/vault/vaultSession"
import { parseSignInFragment } from "@/lib/vault/signInLink"
import { fromBase64Url, randomBytes, toBase64Url } from "@/shared/bytes"

import { TEST_SETUP_CODE } from "../server/testkit"
import { createBrowser, createTestServer, type Browser } from "./harness"

const PASSWORD = "correct horse battery staple"
const VAULT = "family"

afterEach(() => vi.unstubAllGlobals())

/** A PRF authenticator in software: output = HMAC(credential secret, salt). */
function authenticator() {
  const secrets = new Map<string, Uint8Array>()
  const prf = (id: string, salt: Uint8Array) => hmac(sha256, secrets.get(id)!, salt)
  return {
    enroll(label: string): PasskeyEnrollment {
      const id = toBase64Url(randomBytes(16))
      secrets.set(id, randomBytes(32))
      const salt = randomBytes(32)
      return { id, salt, prfOutput: prf(id, salt), label }
    },
    /** Answers with the first allowed credential it holds (optionally only `id`). */
    provider(only?: string): PasskeyProvider & { calls: number } {
      const provider = {
        calls: 0,
        async evaluate(credentials: { id: string; salt: string }[]) {
          provider.calls++
          const match = credentials.find((c) => secrets.has(c.id) && (!only || c.id === only))
          if (!match) throw new DOMException("No passkey available.", "NotAllowedError")
          return { id: match.id, output: prf(match.id, fromBase64Url(match.salt)) }
        },
      }
      return provider
    },
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
  const keys = authenticator()
  return { server, home, session, kit, keys, secretKey: parseKey("SK1", kit.secretKey) }
}

async function unlock(browser: Browser, options: OpenOptions & { emailToken?: string } = {}) {
  browser.activate()
  const pending = await preparePasswordUnlock(browser.deps, VAULT, PASSWORD)
  const downloaded = await requestUnlock(browser.deps, pending, {
    trustDevice: false,
    ...(options.emailToken ? { emailToken: options.emailToken } : {}),
  })
  return (await openDownloadedVault(browser.deps, downloaded, options)).session
}

async function requirePasskey() {
  const s = await setup()
  const yubikey = s.keys.enroll("YubiKey")
  await s.session.rekey({ proof: { password: PASSWORD }, addPasskey: yubikey })
  expect(s.session.header.requirePasskey).toBeUndefined()
  await expect(unlock(s.home)).resolves.toBeDefined() // enrolled, not yet required
  await s.session.rekey({ proof: { password: PASSWORD }, requirePasskey: true })
  expect(s.session.header.requirePasskey).toBe(true)
  return { ...s, yubikey }
}

describe("require passkey", () => {
  it("makes every password unlock need a touch", async () => {
    const s = await requirePasskey()
    await expect(unlock(s.home)).rejects.toBeInstanceOf(NeedPasskeyError)
    await expect(unlock(s.home, { passkey: s.keys.provider() })).resolves.toBeDefined()
  })

  it("asks a new device for the Secret Key before the passkey", async () => {
    const s = await requirePasskey()
    const laptop = createBrowser(s.server)
    const touch = s.keys.provider()
    await expect(unlock(laptop, { passkey: touch })).rejects.toSatisfy(
      (e) => e instanceof NeedSecretKeyError && e.reason === "missing"
    )
    expect(touch.calls).toBe(0)
    await expect(unlock(laptop, { passkey: touch, secretKey: s.secretKey })).resolves.toBeDefined()
  })

  it("needs only one touch when the Secret Key was mistyped", async () => {
    const s = await requirePasskey()
    const laptop = createBrowser(s.server)
    const touch = s.keys.provider()
    const remembered = rememberPasskey(touch)
    const wrong = s.secretKey.slice()
    wrong[3]! ^= 0x40
    await expect(unlock(laptop, { passkey: remembered, secretKey: wrong })).rejects.toSatisfy(
      (e) => e instanceof NeedSecretKeyError && e.reason === "wrong"
    )
    await expect(unlock(laptop, { passkey: remembered, secretKey: s.secretKey })).resolves.toBeDefined()
    expect(touch.calls).toBe(1)
    remembered.forget()
  })

  it("reports a passkey whose answer does not unwrap the key", async () => {
    const s = await requirePasskey()
    const impostor: PasskeyProvider = {
      evaluate: async () => ({ id: s.yubikey.id, output: randomBytes(32) }),
    }
    await expect(unlock(s.home, { passkey: impostor })).rejects.toBeInstanceOf(WrongPasskeyError)
  })

  it("works with any enrolled passkey and stops working for a removed one", async () => {
    const s = await requirePasskey()
    const phone = s.keys.enroll("Phone")
    await s.session.rekey({ proof: { password: PASSWORD }, addPasskey: phone })
    expect(s.session.header.passkeys).toHaveLength(2)
    await expect(unlock(s.home, { passkey: s.keys.provider(phone.id) })).resolves.toBeDefined()
    await expect(unlock(s.home, { passkey: s.keys.provider(s.yubikey.id) })).resolves.toBeDefined()

    await s.session.rekey({ proof: { password: PASSWORD }, removePasskeys: [s.yubikey.id] })
    expect(s.session.header.requirePasskey).toBe(true)
    await expect(unlock(s.home, { passkey: s.keys.provider(s.yubikey.id) })).rejects.toSatisfy(
      (e) => e instanceof DOMException && e.name === "NotAllowedError"
    )
    await expect(unlock(s.home, { passkey: s.keys.provider(phone.id) })).resolves.toBeDefined()
  })

  it("leaves the Recovery Key working without a passkey", async () => {
    const s = await requirePasskey()
    const phone = createBrowser(s.server)
    phone.activate()
    const recoveryKey = parseKey("RK1", s.kit.recoveryKey!)
    const downloaded = await requestUnlock(phone.deps, prepareRecoveryUnlock(VAULT, recoveryKey), {
      trustDevice: false,
    })
    const { mustRekey } = await openDownloadedVault(phone.deps, downloaded)
    expect(mustRekey).toBe(true)
  })

  it("also guards email unlock", async () => {
    const s = await requirePasskey()
    await s.session.accountRequest({
      op: "email.set",
      proof: await s.session.passwordProof(PASSWORD),
      email: "pat@example.com",
    })
    const code = /is (\d{6})\./.exec(s.server.mailer.sent.at(-1)!.text)![1]!
    await s.session.accountRequest({ op: "email.confirm", code })
    await s.session.rekey({ proof: { password: PASSWORD }, emailUnlock: true })

    const laptop = createBrowser(s.server)
    laptop.activate()
    const pending = await preparePasswordUnlock(laptop.deps, VAULT, PASSWORD)
    await requestEmailLink(laptop.deps, pending)
    const link = /https:\/\/\S+\/verify#\S+/.exec(s.server.mailer.sent.at(-1)!.text)![0]
    const emailToken = parseSignInFragment(new URL(link).hash)!.token
    // The server accepts the link; opening the email slot then needs the touch
    // (the Gate keeps this download and only asks for the passkey).
    const downloaded = await requestUnlock(laptop.deps, pending, { trustDevice: false, emailToken })
    await expect(openDownloadedVault(laptop.deps, downloaded)).rejects.toBeInstanceOf(
      NeedPasskeyError
    )
    await expect(
      openDownloadedVault(laptop.deps, downloaded, { passkey: s.keys.provider() })
    ).resolves.toBeDefined()
  })

  it("turns off again, and cannot be on without a passkey", async () => {
    const s = await requirePasskey()
    await s.session.rekey({ proof: { password: PASSWORD }, requirePasskey: false })
    await expect(unlock(s.home)).resolves.toBeDefined()

    await s.session.rekey({ proof: { password: PASSWORD }, removePasskeys: [s.yubikey.id] })
    await s.session.rekey({ proof: { password: PASSWORD }, requirePasskey: true })
    expect(s.session.header.requirePasskey).toBeUndefined()
    expect(s.session.header.passkeys).toBeUndefined()
  })
})
