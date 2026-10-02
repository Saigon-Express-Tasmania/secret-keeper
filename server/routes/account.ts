/**
 * POST /account — security settings for the signed-in vault.
 * Every operation that weakens or changes a gate needs step-up proof.
 *
 * "This browser" is whichever trusted device its cookie proves, so the
 * session token itself carries no device binding.
 */

import type { AccountStatus } from "../../src/shared/api"
import { base32Decode } from "../../src/lib/otp/base32"
import type { AuthRecord } from "../authRecord"
import type { RouteContext, Route } from "../context"
import {
  DEVICE_TTL_SECONDS,
  deviceCookieName,
  hashDeviceSecret,
  newDeviceToken,
  parseDeviceToken,
  readCookie,
  serializeCookie,
} from "../cookies"
import {
  confirmCodeMessage,
  EMAIL_CODE_MAX_TRIES,
  EMAIL_CODE_TTL_SECONDS,
  emailCodeMatches,
  hashEmailCode,
  mailFailed,
  mailNotConfigured,
  mailWait,
  newEmailCode,
  parseEmailAddress,
  tooManyEmails,
} from "../email"
import {
  badRequest,
  getBoolean,
  getString,
  HttpError,
  jsonResponse,
  readJson,
  type JsonObject,
} from "../http"
import { loadMeta, updateMeta, type DeviceRecord } from "../meta"
import { notifyEmailChanged, notifyNewDevice, notifyTotpDisabled } from "../notify"
import { seal, unseal } from "../secrets"
import type { SessionClaims } from "../session"
import { maskEmail, TOTP_SECRET_BYTES, verifyTotp } from "../twoFactor"
import { requireSession, verifyStepUp } from "./auth"
import { sanitizeLabel } from "./unlock"

export type AccountOpContext = {
  ctx: RouteContext
  body: JsonObject
  claims: SessionClaims
  record: AuthRecord
}

type AccountOp = (op: AccountOpContext) => Promise<Response>

/** What this browser's device cookie proves: a device id and secret hash. */
type BrowserDevice = { id: string; h: string } | null

function browserDevice(ctx: RouteContext, name: string): BrowserDevice {
  const token = parseDeviceToken(
    readCookie(ctx.request.headers.get("cookie"), deviceCookieName(name, ctx.secure))
  )
  return token ? { id: token.id, h: hashDeviceSecret(token.secret) } : null
}

function isBrowser(device: DeviceRecord, here: BrowserDevice): boolean {
  return here !== null && device.id === here.id && device.h === here.h
}

function clearDeviceCookie(ctx: RouteContext, name: string): string {
  return serializeCookie(deviceCookieName(name, ctx.secure), "", { secure: ctx.secure, maxAge: 0 })
}

export async function accountStatus(
  ctx: RouteContext,
  name: string,
  record: AuthRecord,
  here: BrowserDevice
): Promise<AccountStatus> {
  const { meta } = await loadMeta(ctx.store, name, record.vid)
  const now = ctx.nowSeconds()
  const open = async (sealed: string, field: string) =>
    maskEmail(new TextDecoder().decode(await unseal(ctx.keys, [name, record.vid, field], sealed)))
  return {
    totp: meta.totp !== null,
    email: meta.email ? await open(meta.email.addr, "email") : null,
    emailUnlock: record.se !== undefined,
    pendingEmail:
      meta.pendingEmail && meta.pendingEmail.exp > now
        ? await open(meta.pendingEmail.addr, "pending-email")
        : null,
    devices: meta.devices
      .filter((device) => device.exp > now)
      .map((device) => ({
        id: device.id,
        label: device.label,
        created: device.created,
        exp: device.exp,
        current: isBrowser(device, here),
      })),
  }
}

const status: AccountOp = async ({ ctx, claims, record }) =>
  jsonResponse(200, await accountStatus(ctx, claims.n, record, browserDevice(ctx, claims.n)))

/** Check the master password (e.g. before showing the Secret Key). */
const verify: AccountOp = async ({ ctx, body, claims, record }) => {
  await verifyStepUp(ctx, claims.n, record, body.proof)
  return jsonResponse(200, { ok: true })
}

/** Revoke one trusted device by id, or "all". */
const revokeDevices: AccountOp = async ({ ctx, body, claims, record }) => {
  const id = getString(body, "id", { max: 64 })
  await verifyStepUp(ctx, claims.n, record, body.proof)
  await updateMeta(ctx.store, claims.n, record.vid, (meta) => {
    const before = meta.devices.length
    meta.devices = id === "all" ? [] : meta.devices.filter((device) => device.id !== id)
    return { value: null, changed: meta.devices.length !== before }
  })
  const here = browserDevice(ctx, claims.n)
  const headers = new Headers()
  if (here && (id === "all" || id === here.id)) {
    headers.append("set-cookie", clearDeviceCookie(ctx, claims.n))
  }
  return jsonResponse(200, await accountStatus(ctx, claims.n, record, here), headers)
}

/**
 * Turn on TOTP. The browser generates the secret and proves it with a code.
 * Trust ends on every other device; this browser stays (or becomes) trusted
 * only when asked to.
 */
const enableTotp: AccountOp = async ({ ctx, body, claims, record }) => {
  const name = claims.n
  const secretText = getString(body, "secret", { max: 128 })
  const code = getString(body, "code", { max: 12 })
  const trust = getBoolean(body, "trustDevice")
  const label = sanitizeLabel(getString(body, "deviceLabel", { max: 200, optional: true }))
  let secret: Uint8Array
  try {
    secret = base32Decode(secretText)
  } catch {
    throw badRequest("Invalid TOTP secret.")
  }
  if (secret.byteLength < TOTP_SECRET_BYTES) throw badRequest("TOTP secret is too short.")

  await verifyStepUp(ctx, name, record, body.proof)
  const now = ctx.nowSeconds()
  const step = verifyTotp(secret, code, now, 0)
  if (step === null) {
    throw new HttpError(
      400,
      "bad_second_factor",
      "That code does not match. Check the time on your phone and try the next code."
    )
  }
  const sealed = await seal(ctx.keys, [name, record.vid, "totp"], secret)
  const here = browserDevice(ctx, name)
  const token = trust ? newDeviceToken() : null

  const result = await updateMeta<"on_already" | "kept" | "added" | "none">(
    ctx.store,
    name,
    record.vid,
    (meta) => {
      // Replacing an active secret would bypass the code totp.disable asks for.
      if (meta.totp) return { value: "on_already", changed: false }
      meta.totp = { s: sealed, last: step }
      const kept = trust ? meta.devices.find((d) => isBrowser(d, here) && d.exp > now) : undefined
      meta.devices = kept ? [kept] : []
      if (kept || !token) return { value: kept ? "kept" : "none", changed: true }
      meta.devices = [
        {
          id: token.id,
          h: hashDeviceSecret(token.secret),
          label,
          created: now,
          exp: now + DEVICE_TTL_SECONDS,
          fails: 0,
        },
      ]
      return { value: "added", changed: true }
    }
  )
  if (result === "on_already") {
    throw new HttpError(
      409,
      "conflict",
      "Two-step verification is already on. Turn it off first to move it to another app."
    )
  }

  const headers = new Headers()
  let browser = here
  if (result === "added" && token) {
    headers.append(
      "set-cookie",
      serializeCookie(deviceCookieName(name, ctx.secure), token.value, {
        secure: ctx.secure,
        maxAge: DEVICE_TTL_SECONDS,
      })
    )
    browser = { id: token.id, h: hashDeviceSecret(token.secret) }
    ctx.waitUntil(notifyNewDevice(ctx, name, record.vid, label))
  } else if (result === "none" && here) {
    headers.append("set-cookie", clearDeviceCookie(ctx, name))
  }
  return jsonResponse(200, await accountStatus(ctx, name, record, browser), headers)
}

/**
 * Turn off TOTP: master password + a current code, or the Recovery Key
 * alone (lost phone). A wrong code counts toward the lockout like a wrong
 * password, so codes cannot be guessed from a stolen session.
 */
const disableTotp: AccountOp = async ({ ctx, body, claims, record }) => {
  const name = claims.n
  const code = getString(body, "code", { max: 12, optional: true })
  const now = ctx.nowSeconds()
  let disabled = false
  await verifyStepUp(ctx, name, record, body.proof, async (meta, kind) => {
    disabled = false
    if (!meta.totp) return true
    if (kind === "password") {
      const secret = await unseal(ctx.keys, [name, record.vid, "totp"], meta.totp.s)
      if (code === undefined || verifyTotp(secret, code, now, meta.totp.last) === null) {
        return false
      }
    }
    meta.totp = null
    disabled = true
    return true
  })
  if (disabled) ctx.waitUntil(notifyTotpDisabled(ctx, name, record.vid))
  return jsonResponse(200, await accountStatus(ctx, name, record, browserDevice(ctx, name)))
}

const utf8Text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/**
 * Start setting (or changing) the email address: a 6-digit code goes to the
 * new address and the change waits for it. The current address stays in
 * use until then.
 */
const setEmail: AccountOp = async ({ ctx, body, claims, record }) => {
  const name = claims.n
  const address = parseEmailAddress(getString(body, "email", { max: 320 }))
  const mailer = ctx.mailer
  if (!mailer) throw mailNotConfigured()
  await verifyStepUp(ctx, name, record, body.proof)
  const now = ctx.nowSeconds()
  const code = newEmailCode()
  const sealed = await seal(ctx.keys, [name, record.vid, "pending-email"], new TextEncoder().encode(address))
  const wait = await updateMeta(ctx.store, name, record.vid, (meta) => {
    const wait = mailWait(meta, now)
    if (wait > 0) return { value: wait, changed: false }
    meta.mail.push(now)
    meta.pendingEmail = {
      addr: sealed,
      code: hashEmailCode(ctx.keys, record.vid, code),
      exp: now + EMAIL_CODE_TTL_SECONDS,
      tries: 0,
    }
    return { value: 0, changed: true }
  })
  if (wait > 0) throw tooManyEmails(wait)
  try {
    await mailer.send(confirmCodeMessage(address, name, code))
  } catch (error) {
    ctx.log(`confirmation mail failed: ${error instanceof Error ? error.message : String(error)}`)
    throw mailFailed()
  }
  return jsonResponse(200, await accountStatus(ctx, name, record, browserDevice(ctx, name)))
}

/** Finish an address change with the mailed code (5 tries, 15 minutes). */
const confirmEmail: AccountOp = async ({ ctx, body, claims, record }) => {
  const name = claims.n
  const code = getString(body, "code", { max: 12 }).replace(/\s/g, "")
  const now = ctx.nowSeconds()
  type Outcome = { kind: "none" } | { kind: "bad" } | { kind: "ok"; replaced: string | null }
  const outcome = await updateMeta<Outcome>(ctx.store, name, record.vid, async (meta) => {
    const pending = meta.pendingEmail
    if (!pending || pending.exp <= now) {
      meta.pendingEmail = null
      return { value: { kind: "none" }, changed: pending !== null }
    }
    if (!/^\d{6}$/.test(code) || !emailCodeMatches(ctx.keys, record.vid, code, pending.code)) {
      pending.tries += 1
      if (pending.tries >= EMAIL_CODE_MAX_TRIES) meta.pendingEmail = null
      return { value: { kind: "bad" }, changed: true }
    }
    const address = await unseal(ctx.keys, [name, record.vid, "pending-email"], pending.addr)
    const previous = meta.email
      ? utf8Text(await unseal(ctx.keys, [name, record.vid, "email"], meta.email.addr))
      : null
    meta.email = { addr: await seal(ctx.keys, [name, record.vid, "email"], address) }
    meta.pendingEmail = null
    // Links already sent went to the old address.
    meta.links = []
    const replaced = previous !== null && previous !== utf8Text(address) ? previous : null
    return { value: { kind: "ok", replaced }, changed: true }
  })
  if (outcome.kind === "none") {
    throw new HttpError(409, "conflict", "No email change is waiting for a code. Enter the address again.")
  }
  if (outcome.kind === "bad") {
    throw new HttpError(400, "bad_second_factor", "That code is not valid. Check the latest email.")
  }
  // Tell the old address, in case someone else made the change.
  if (outcome.replaced) ctx.waitUntil(notifyEmailChanged(ctx, name, record.vid, outcome.replaced))
  return jsonResponse(200, await accountStatus(ctx, name, record, browserDevice(ctx, name)))
}

/** Remove the address (and any pending change and sign-in links). */
const removeEmail: AccountOp = async ({ ctx, body, claims, record }) => {
  const name = claims.n
  if (record.se !== undefined) {
    throw new HttpError(409, "conflict", "Turn off email unlock before removing the address.")
  }
  await verifyStepUp(ctx, name, record, body.proof)
  const previous = await updateMeta<string | null>(ctx.store, name, record.vid, async (meta) => {
    const address = meta.email
      ? utf8Text(await unseal(ctx.keys, [name, record.vid, "email"], meta.email.addr))
      : null
    const changed = meta.email !== null || meta.pendingEmail !== null || meta.links.length > 0
    meta.email = null
    meta.pendingEmail = null
    meta.links = []
    return { value: address, changed }
  })
  if (previous) ctx.waitUntil(notifyEmailChanged(ctx, name, record.vid, previous))
  return jsonResponse(200, await accountStatus(ctx, name, record, browserDevice(ctx, name)))
}

export const ACCOUNT_OPS: Record<string, AccountOp> = {
  status,
  verify,
  "devices.revoke": revokeDevices,
  "totp.enable": enableTotp,
  "totp.disable": disableTotp,
  "email.set": setEmail,
  "email.confirm": confirmEmail,
  "email.remove": removeEmail,
}

export const account: Route = async (ctx) => {
  const { claims, record } = await requireSession(ctx)
  const body = await readJson(ctx.request)
  const handler = typeof body.op === "string" ? ACCOUNT_OPS[body.op] : undefined
  if (!handler) throw badRequest("Unknown operation.")
  return handler({ ctx, body, claims, record })
}
