/**
 * POST /unlock — the only way to obtain a vault blob, its server share P and
 * a session.
 *
 * Password mode: authKey (+ second factor on untrusted devices).
 *   - TOTP enabled  → a fresh TOTP code is always required off-device.
 *   - else email set → an emailed sign-in token is required off-device.
 *   - a valid email token also releases the email share E, which together
 *     with the password replaces the Secret Key on a new machine.
 * Recovery mode: rkAuth only (break-glass); the client must re-key after.
 *
 * Lockout, device counters, TOTP replay state and link consumption are all
 * updated in one compare-and-swap on meta.json.
 */

import type { AccountSummary, SecondFactorMethod, UnlockResponse } from "../../src/shared/api"
import { fromBase64Url, toBase64Url } from "../../src/shared/bytes"
import { vaultObjectKey } from "../../src/shared/vaultName"
import { decodeAuthRecord } from "../authRecord"
import type { Route } from "../context"
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
  badRequest,
  frameResponse,
  getBoolean,
  getBytes,
  getString,
  HttpError,
  readJson,
} from "../http"
import { MAX_DEVICE_FAILURES, recordFailure } from "../lockout"
import { notifyRecoveryUsed, notifyNewDevice } from "../notify"
import { updateMeta, type DeviceRecord, type VaultMeta } from "../meta"
import { checkVerifier, unseal } from "../secrets"
import { issueSession, SESSION_TTL_SECONDS } from "../session"
import { hashLinkToken, maskEmail, verifyTotp } from "../twoFactor"
import { loadAuthRecord, vaultNameFrom } from "./common"

export const MAX_DEVICES = 10
const LINK_TOKEN_BYTES = 32
const INVALID = "Invalid vault name or credentials."

type Failure = "bad_credentials" | "bad_second_factor"

type Outcome =
  | { kind: "locked"; retryAfter: number }
  | { kind: Failure; retryAfter?: number }
  | { kind: "second_factor_required"; methods: SecondFactorMethod[] }
  | {
      kind: "ok"
      account: AccountSummary
      /** Expiry of this browser's trust, when it is a trusted device. */
      deviceExp?: number
      newDeviceCookie?: string
      releaseEmailShare: boolean
    }

/** Keep device labels short and printable. */
export function sanitizeLabel(label: string | undefined): string {
  const clean = (label ?? "").replace(/[^\p{L}\p{N} .,()/_-]/gu, "").trim().slice(0, 60)
  return clean || "Browser"
}

export async function accountSummary(
  meta: VaultMeta,
  unsealEmail: (sealed: string) => Promise<string>,
  emailUnlock: boolean
): Promise<AccountSummary> {
  return {
    totp: meta.totp !== null,
    email: meta.email ? maskEmail(await unsealEmail(meta.email.addr)) : null,
    emailUnlock,
  }
}

export const unlock: Route = async (ctx) => {
  const body = await readJson(ctx.request)
  const name = vaultNameFrom(body)
  const mode = body.mode
  if (mode !== "password" && mode !== "recovery") throw badRequest("Invalid mode.")
  const credential = getBytes(body, mode === "password" ? "authKey" : "rkAuth", 32)
  const totpCode = mode === "password" ? getString(body, "totp", { max: 12, optional: true }) : undefined
  const tokenText =
    mode === "password" ? getString(body, "emailToken", { max: 64, optional: true }) : undefined
  let emailToken: Uint8Array | undefined
  if (tokenText !== undefined) {
    try {
      emailToken = fromBase64Url(tokenText, LINK_TOKEN_BYTES)
    } catch {
      throw badRequest("Invalid sign-in link.")
    }
  }
  const trustDevice = getBoolean(body, "trustDevice")
  const label = sanitizeLabel(getString(body, "deviceLabel", { max: 200, optional: true }))

  const found = await loadAuthRecord(ctx, name)
  if (!found) throw new HttpError(401, "bad_credentials", INVALID)
  const { record } = found
  const credentialOk = checkVerifier(
    ctx.keys,
    mode === "password" ? record.av : record.rv,
    mode,
    record.vid,
    credential
  )

  const cookieName = deviceCookieName(name, ctx.secure)
  const deviceToken = parseDeviceToken(readCookie(ctx.request.headers.get("cookie"), cookieName))
  const now = ctx.nowSeconds()
  const unsealEmail = async (sealed: string) =>
    new TextDecoder().decode(await unseal(ctx.keys, [name, record.vid, "email"], sealed))

  const outcome = await updateMeta<Outcome>(ctx.store, name, record.vid, async (meta) => {
    let changed = false
    const live = meta.devices.filter((d) => d.exp > now)
    if (live.length !== meta.devices.length) {
      meta.devices = live
      changed = true
    }
    const device = deviceToken
      ? meta.devices.find(
          (d) => d.id === deviceToken.id && d.h === hashDeviceSecret(deviceToken.secret)
        )
      : undefined

    // A trusted device has its own counter, so a lockout caused by someone
    // else's guessing does not lock its owner out.
    if (!device && meta.lock.until > now) {
      return { value: { kind: "locked", retryAfter: meta.lock.until - now }, changed }
    }

    const fail = (kind: Failure) => {
      if (device) {
        device.fails += 1
        if (device.fails >= MAX_DEVICE_FAILURES) {
          meta.devices = meta.devices.filter((d) => d !== device)
        }
        return { value: { kind } as Outcome, changed: true }
      }
      const lockFor = recordFailure(meta.lock, now)
      return {
        value: { kind, ...(lockFor > 0 ? { retryAfter: lockFor } : {}) } as Outcome,
        changed: true,
      }
    }

    if (!credentialOk) return fail("bad_credentials")

    const methods: SecondFactorMethod[] = []
    if (meta.totp) methods.push("totp")
    if (meta.email) methods.push("email")

    let linkIndex = -1
    if (emailToken) {
      const hash = hashLinkToken(emailToken)
      linkIndex = meta.links.findIndex((link) => link.h === hash && link.exp > now)
      if (linkIndex < 0) return fail("bad_second_factor")
    }

    let totpStep: number | null = null
    if (totpCode !== undefined && meta.totp) {
      const secret = await unseal(ctx.keys, [name, record.vid, "totp"], meta.totp.s)
      totpStep = verifyTotp(secret, totpCode, now, meta.totp.last)
      if (totpStep === null) return fail("bad_second_factor")
    }

    let secondFactorOk: boolean
    if (mode === "recovery" || device) secondFactorOk = true
    else if (meta.totp) secondFactorOk = totpStep !== null
    else if (meta.email) secondFactorOk = linkIndex >= 0
    else secondFactorOk = true
    if (!secondFactorOk) {
      return { value: { kind: "second_factor_required", methods }, changed }
    }

    // Success: consume one-time factors, reset counters, maybe trust device.
    if (totpStep !== null) {
      meta.totp!.last = totpStep
      changed = true
    }
    if (linkIndex >= 0) {
      meta.links.splice(linkIndex, 1)
      changed = true
    }
    if (meta.lock.fails !== 0 || meta.lock.until !== 0) {
      meta.lock = { fails: 0, until: 0 }
      changed = true
    }
    if (device && device.fails !== 0) {
      device.fails = 0
      changed = true
    }

    let deviceExp = device?.exp
    let newDeviceCookie: string | undefined
    const realFactor = mode === "recovery" || totpStep !== null || linkIndex >= 0
    if (!device && trustDevice && realFactor) {
      const token = newDeviceToken()
      const record: DeviceRecord = {
        id: token.id,
        h: hashDeviceSecret(token.secret),
        label,
        created: now,
        exp: now + DEVICE_TTL_SECONDS,
        fails: 0,
      }
      meta.devices = [record, ...meta.devices]
        .sort((a, b) => b.created - a.created)
        .slice(0, MAX_DEVICES)
      newDeviceCookie = token.value
      deviceExp = record.exp
      changed = true
    }

    return {
      value: {
        kind: "ok",
        account: await accountSummary(meta, unsealEmail, record.se !== undefined),
        deviceExp,
        newDeviceCookie,
        releaseEmailShare: linkIndex >= 0,
      },
      changed,
    }
  })

  switch (outcome.kind) {
    case "locked":
      throw new HttpError(429, "locked", "Too many failed attempts. Try again later.", {
        retryAfter: outcome.retryAfter,
      })
    case "bad_credentials":
      throw new HttpError(401, "bad_credentials", INVALID, retryExtra(outcome.retryAfter))
    case "bad_second_factor":
      throw new HttpError(
        401,
        "bad_second_factor",
        "That code or link is not valid (or was already used).",
        retryExtra(outcome.retryAfter)
      )
    case "second_factor_required":
      throw new HttpError(401, "second_factor_required", "A second factor is required.", {
        methods: outcome.methods,
      })
  }

  const object = await ctx.store.get(vaultObjectKey(name))
  const current = object ? decodeAuthRecord(object.meta) : null
  if (!object || !current || current.vid !== record.vid || current.ae !== record.ae) {
    throw new HttpError(409, "conflict", "The vault changed while unlocking. Try again.")
  }

  const srvShare = await unseal(ctx.keys, [name, current.vid, "sp"], current.sp)
  const emailShare =
    outcome.releaseEmailShare && current.se
      ? await unseal(ctx.keys, [name, current.vid, "se"], current.se)
      : undefined
  const sessionExp = now + SESSION_TTL_SECONDS
  const session = issueSession(ctx.keys, {
    n: name,
    vid: current.vid,
    ae: current.ae,
    exp: sessionExp,
  })

  const response: UnlockResponse = {
    session,
    sessionExp,
    etag: object.etag,
    rev: current.rev,
    srvShare: toBase64Url(srvShare),
    ...(emailShare ? { emailShare: toBase64Url(emailShare) } : {}),
    account: outcome.account,
    device: outcome.deviceExp ? { trusted: true, exp: outcome.deviceExp } : { trusted: false },
  }

  if (mode === "recovery") ctx.waitUntil(notifyRecoveryUsed(ctx, name, record.vid))
  if (outcome.newDeviceCookie) ctx.waitUntil(notifyNewDevice(ctx, name, record.vid, label))

  const headers = new Headers()
  if (outcome.newDeviceCookie) {
    headers.append(
      "set-cookie",
      serializeCookie(cookieName, outcome.newDeviceCookie, {
        secure: ctx.secure,
        maxAge: DEVICE_TTL_SECONDS,
      })
    )
  }
  return frameResponse(200, response, object.body, headers)
}

function retryExtra(retryAfter: number | undefined) {
  return retryAfter !== undefined ? { retryAfter } : {}
}
