/**
 * Email factor end to end: confirming an address, sign-in links as a
 * second factor, email unlock (link + password instead of the Secret Key),
 * limits, and security notices.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { encryptFileJson } from "@/lib/crypto/file"
import { isApiError } from "@/lib/api/client"
import { parseKey } from "@/lib/crypto/keys"
import { base32Encode } from "@/lib/otp/base32"
import { generateHotp } from "@/lib/otp/otp"
import { putFile } from "@/lib/vault/fs"
import { parseSignInFragment } from "@/lib/vault/signInLink"
import {
  createVault,
  NeedSecretKeyError,
  openDownloadedVault,
  preparePasswordUnlock,
  prepareRecoveryUnlock,
  requestEmailLink,
  requestUnlock,
  type VaultSession,
} from "@/lib/vault/vaultSession"
import type { AccountStatus } from "@/shared/api"
import { toBase64Url } from "@/shared/bytes"

import type { MailMessage } from "../server/mail"
import { TEST_ORIGIN, TEST_SETUP_CODE } from "../server/testkit"
import { createBrowser, createTestServer, type Browser } from "./harness"

const PASSWORD = "correct horse battery staple"
const VAULT = "family"
const ADDRESS = "pat@example.com"
const MINUTE = 60_000

afterEach(() => vi.unstubAllGlobals())

async function setup(...args: Parameters<typeof createTestServer>) {
  const server = await createTestServer(...args)
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

const lastMail = (s: Setup, to: string): MailMessage => {
  const mail = s.server.mailer.sent.filter((m) => m.to === to).at(-1)
  if (!mail) throw new Error(`no mail to ${to}`)
  return mail
}

const codeIn = (mail: MailMessage) => /is (\d{6})\./.exec(mail.text)![1]!

function tokenIn(mail: MailMessage): string {
  const link = /https:\/\/\S+\/verify#\S+/.exec(mail.text)![0]
  return parseSignInFragment(new URL(link).hash)!.token
}

async function confirmAddress(s: Setup, session: VaultSession, address = ADDRESS) {
  await session.accountRequest({
    op: "email.set",
    proof: await session.passwordProof(PASSWORD),
    email: address,
  })
  return session.accountRequest<AccountStatus>({
    op: "email.confirm",
    code: codeIn(lastMail(s, address)),
  })
}

async function passwordUnlock(
  browser: Browser,
  options: { emailToken?: string; totp?: string; trustDevice?: boolean; password?: string } = {}
) {
  browser.activate()
  const pending = await preparePasswordUnlock(browser.deps, VAULT, options.password ?? PASSWORD)
  return requestUnlock(browser.deps, pending, {
    trustDevice: options.trustDevice ?? false,
    ...(options.emailToken ? { emailToken: options.emailToken } : {}),
    ...(options.totp ? { totp: options.totp } : {}),
  })
}

async function mailLink(s: Setup, browser: Browser): Promise<string> {
  browser.activate()
  const pending = await preparePasswordUnlock(browser.deps, VAULT, PASSWORD)
  const sent = await requestEmailLink(browser.deps, pending)
  expect(sent).toEqual({ to: "p•••@example.com", ttl: 900 })
  return tokenIn(lastMail(s, ADDRESS))
}

describe("confirming an address", () => {
  it("mails a code to the new address and switches only after it is entered", async () => {
    const s = await setup()
    await expect(
      s.session.accountRequest({
        op: "email.set",
        proof: await s.session.passwordProof("not my password"),
        email: ADDRESS,
      })
    ).rejects.toSatisfy((e) => isApiError(e, "step_up_failed"))
    await expect(
      s.session.accountRequest({
        op: "email.set",
        proof: await s.session.passwordProof(PASSWORD),
        email: "pat at example.com",
      })
    ).rejects.toSatisfy((e) => isApiError(e, "bad_request"))

    const pending = await s.session.accountRequest<AccountStatus>({
      op: "email.set",
      proof: await s.session.passwordProof(PASSWORD),
      email: ` ${ADDRESS} `,
    })
    expect(pending).toMatchObject({ email: null, pendingEmail: "p•••@example.com" })
    const code = codeIn(lastMail(s, ADDRESS))
    const wrong = code === "000000" ? "000001" : "000000"
    await expect(s.session.accountRequest({ op: "email.confirm", code: wrong })).rejects.toSatisfy(
      (e) => isApiError(e, "bad_second_factor")
    )
    const confirmed = await s.session.accountRequest<AccountStatus>({ op: "email.confirm", code })
    expect(confirmed).toMatchObject({ email: "p•••@example.com", pendingEmail: null })

    const meta = new TextDecoder().decode((await s.server.store.get(`meta/${VAULT}.json`))!.body)
    expect(meta).not.toContain("example.com")
  })

  it("gives up after five wrong codes", async () => {
    const s = await setup()
    await s.session.accountRequest({
      op: "email.set",
      proof: await s.session.passwordProof(PASSWORD),
      email: ADDRESS,
    })
    const code = codeIn(lastMail(s, ADDRESS))
    const wrong = code === "000000" ? "000001" : "000000"
    for (let i = 0; i < 5; i++) {
      await expect(s.session.accountRequest({ op: "email.confirm", code: wrong })).rejects.toSatisfy(
        (e) => isApiError(e, "bad_second_factor")
      )
    }
    await expect(s.session.accountRequest({ op: "email.confirm", code })).rejects.toSatisfy((e) =>
      isApiError(e, "conflict")
    )
  })

  it("tells the old address when it changes", async () => {
    const s = await setup()
    await confirmAddress(s, s.session)
    const status = await confirmAddress(s, s.session, "sam@example.org")
    expect(status.email).toBe("s•••@example.org")
    expect(lastMail(s, ADDRESS).subject).toContain("email address changed")
  })

  it("limits how many emails a vault can send", async () => {
    const s = await setup()
    const set = async () =>
      s.session.accountRequest({
        op: "email.set",
        proof: await s.session.passwordProof(PASSWORD),
        email: ADDRESS,
      })
    for (let i = 0; i < 3; i++) await set()
    const limited = await set().catch((e: unknown) => e)
    expect(isApiError(limited, "rate_limited") && limited.retryAfter).toBe(15 * 60)
    s.server.clock.now += 15 * MINUTE + 1000
    await expect(set()).resolves.toBeDefined()
  })
})

describe("sign-in links as the second factor", () => {
  it("are required on new devices once an address is confirmed, and work once", async () => {
    const s = await setup()
    await confirmAddress(s, s.session)
    const laptop = createBrowser(s.server)
    await expect(passwordUnlock(laptop)).rejects.toSatisfy(
      (e) => isApiError(e, "second_factor_required") && e.methods?.join() === "email"
    )

    const token = await mailLink(s, laptop)
    expect(lastMail(s, ADDRESS).text).toContain(`${TEST_ORIGIN}/verify#v=${VAULT}&t=`)
    const downloaded = await passwordUnlock(laptop, { emailToken: token })
    expect(downloaded.meta.emailShare).toBeUndefined()
    // Without email unlock the link is only a second factor: the Secret Key is still needed.
    await expect(openDownloadedVault(laptop.deps, downloaded)).rejects.toBeInstanceOf(
      NeedSecretKeyError
    )
    await expect(
      openDownloadedVault(laptop.deps, downloaded, { secretKey: s.secretKey })
    ).resolves.toBeDefined()

    await expect(passwordUnlock(createBrowser(s.server), { emailToken: token })).rejects.toSatisfy(
      (e) => isApiError(e, "bad_second_factor")
    )
  })

  it("expire after 15 minutes and are not used up by a wrong password", async () => {
    const s = await setup()
    await confirmAddress(s, s.session)
    const laptop = createBrowser(s.server)
    const stale = await mailLink(s, laptop)
    s.server.clock.now += 16 * MINUTE
    await expect(passwordUnlock(laptop, { emailToken: stale })).rejects.toSatisfy((e) =>
      isApiError(e, "bad_second_factor")
    )

    const token = await mailLink(s, laptop)
    await expect(
      passwordUnlock(laptop, { emailToken: token, password: "wrong password!!" })
    ).rejects.toSatisfy((e) => isApiError(e, "bad_credentials"))
    await expect(passwordUnlock(laptop, { emailToken: token })).resolves.toBeDefined()
  })

  it("need the master password to be sent, and wrong ones count", async () => {
    const s = await setup()
    await confirmAddress(s, s.session)
    const send = (authKey: string) => s.home.deps.api.emailLink({ vault: VAULT, authKey })
    const codes: string[] = []
    for (let i = 0; i < 7; i++) {
      codes.push(await send(toBase64Url(new Uint8Array(32).fill(i))).then(() => "sent", (e) => e.code))
    }
    expect(codes).toEqual([...Array(6).fill("bad_credentials"), "locked"])
    expect(s.server.mailer.sent.filter((m) => m.subject.includes("sign-in link"))).toEqual([])
  })

  it("are refused without an address, for unknown vaults, and without mail", async () => {
    const s = await setup()
    const laptop = createBrowser(s.server)
    const pending = await preparePasswordUnlock(laptop.deps, VAULT, PASSWORD)
    await expect(requestEmailLink(laptop.deps, pending)).rejects.toSatisfy((e) =>
      isApiError(e, "email_not_set")
    )
    const stranger = await preparePasswordUnlock(laptop.deps, "nobody", PASSWORD)
    await expect(requestEmailLink(laptop.deps, stranger)).rejects.toSatisfy((e) =>
      isApiError(e, "bad_credentials")
    )
    expect(s.server.store.keys().some((key) => key.includes("nobody"))).toBe(false)

    const silent = await setup({}, { mailer: null })
    const silentPending = await preparePasswordUnlock(silent.home.deps, VAULT, PASSWORD)
    await expect(requestEmailLink(silent.home.deps, silentPending)).rejects.toSatisfy((e) =>
      isApiError(e, "mail_not_configured")
    )

    const broken = await setup({}, {
      mailer: {
        send: () => Promise.reject(new Error("smtp down")),
      },
    })
    await expect(
      broken.session.accountRequest({
        op: "email.set",
        proof: await broken.session.passwordProof(PASSWORD),
        email: ADDRESS,
      })
    ).rejects.toSatisfy((e) => isApiError(e, "mail_failed"))
  })
})

describe("email unlock", () => {
  async function withEmailUnlock() {
    const s = await setup()
    await confirmAddress(s, s.session)
    await s.session.save(async (archive) => {
      putFile(archive, "notes/a.json", await encryptFileJson({ text: "hi" }, s.session.fileDekKey))
    })
    await s.session.rekey({ proof: { password: PASSWORD }, emailUnlock: true })
    expect(s.session.account.emailUnlock).toBe(true)
    return s
  }

  it("opens a new device with the link and the password, without the Secret Key", async () => {
    const s = await withEmailUnlock()
    const laptop = createBrowser(s.server)
    const token = await mailLink(s, laptop)
    const downloaded = await passwordUnlock(laptop, { emailToken: token, trustDevice: true })
    expect(downloaded.meta.emailShare).toBeDefined()
    const { session } = await openDownloadedVault(laptop.deps, downloaded)
    expect(await session.decryptFile("notes/a.json")).toEqual({ text: "hi" })

    // Trusted: next time the password alone opens it (Secret Key remembered).
    const again = await passwordUnlock(laptop)
    await expect(openDownloadedVault(laptop.deps, again)).resolves.toBeDefined()
    expect(lastMail(s, ADDRESS).subject).toContain("new trusted device")
  })

  it("still needs the authenticator code when TOTP is on", async () => {
    const s = await withEmailUnlock()
    const secret = new Uint8Array(20).fill(5)
    const code = (offset = 0) =>
      generateHotp(secret, Math.floor(s.server.clock.now / 30_000) + offset, 6, "SHA1")
    s.home.activate()
    await s.session.accountRequest({
      op: "totp.enable",
      proof: await s.session.passwordProof(PASSWORD),
      secret: base32Encode(secret),
      code: code(),
    })
    const laptop = createBrowser(s.server)
    const token = await mailLink(s, laptop)
    await expect(passwordUnlock(laptop, { emailToken: token })).rejects.toSatisfy(
      (e) => isApiError(e, "second_factor_required") && e.methods?.join() === "totp,email"
    )
    const downloaded = await passwordUnlock(laptop, { emailToken: token, totp: code(1) })
    await expect(openDownloadedVault(laptop.deps, downloaded)).resolves.toBeDefined()
  })

  it("must be turned off before the address is removed", async () => {
    const s = await withEmailUnlock()
    const remove = async () =>
      s.session.accountRequest({ op: "email.remove", proof: await s.session.passwordProof(PASSWORD) })
    await expect(remove()).rejects.toSatisfy((e) => isApiError(e, "conflict"))
    await s.session.rekey({ proof: { password: PASSWORD }, emailUnlock: false })
    const status = await remove()
    expect(status).toMatchObject({ email: null, emailUnlock: false })
    expect(lastMail(s, ADDRESS).subject).toContain("email address changed")
    // No address: new devices are back to password + Secret Key.
    const downloaded = await passwordUnlock(createBrowser(s.server))
    expect(downloaded.meta.account.email).toBeNull()
  })
})

describe("security notices", () => {
  it("go to the confirmed address", async () => {
    const s = await setup()
    await confirmAddress(s, s.session)
    const subjects = () => s.server.mailer.sent.map((m) => m.subject.replace("Credentials Keep: ", ""))
    s.server.mailer.sent.length = 0

    const phone = createBrowser(s.server)
    phone.activate()
    const recoveryKey = parseKey("RK1", s.kit.recoveryKey!)
    const downloaded = await requestUnlock(phone.deps, prepareRecoveryUnlock(VAULT, recoveryKey), {
      trustDevice: false,
    })
    const { session } = await openDownloadedVault(phone.deps, downloaded)
    await session.rekey({ proof: { recoveryKey }, newPassword: "a new passphrase here" })
    expect(subjects()).toEqual(["Recovery Key used", "security settings changed"])
    expect(s.server.mailer.sent.every((m) => m.to === ADDRESS)).toBe(true)
  })
})
