/**
 * POST /account — security settings for the signed-in vault.
 * Every operation that weakens or changes a gate needs step-up proof.
 */

import type { AccountStatus } from "../../src/shared/api"
import type { AuthRecord } from "../authRecord"
import type { RouteContext, Route } from "../context"
import { deviceCookieName, serializeCookie } from "../cookies"
import { badRequest, getString, HttpError, jsonResponse, readJson, type JsonObject } from "../http"
import { loadMeta, updateMeta } from "../meta"
import { unseal } from "../secrets"
import type { SessionClaims } from "../session"
import { maskEmail } from "../twoFactor"
import { requireSession, verifyStepUp } from "./auth"

export type AccountOpContext = {
  ctx: RouteContext
  body: JsonObject
  claims: SessionClaims
  record: AuthRecord
}

type AccountOp = (op: AccountOpContext) => Promise<Response>

export async function accountStatus(
  ctx: RouteContext,
  claims: SessionClaims,
  record: AuthRecord
): Promise<AccountStatus> {
  const name = claims.n
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
        current: device.id === claims.did,
      })),
  }
}

const status: AccountOp = async ({ ctx, claims, record }) =>
  jsonResponse(200, await accountStatus(ctx, claims, record))

const revokeDevices: AccountOp = async ({ ctx, body, claims, record }) => {
  await verifyStepUp(ctx, claims.n, record, body.proof)
  const id = getString(body, "id", { max: 64 })
  await updateMeta(ctx.store, claims.n, record.vid, (meta) => {
    const before = meta.devices.length
    meta.devices = id === "all" ? [] : meta.devices.filter((device) => device.id !== id)
    return { value: null, changed: meta.devices.length !== before }
  })
  const headers = new Headers()
  if (id === "all" || id === claims.did) {
    headers.append(
      "set-cookie",
      serializeCookie(deviceCookieName(claims.n, ctx.secure), "", { secure: ctx.secure, maxAge: 0 })
    )
  }
  return jsonResponse(200, await accountStatus(ctx, claims, record), headers)
}

/** Extended by later phases (TOTP, email). */
export const ACCOUNT_OPS: Record<string, AccountOp> = {
  status,
  "devices.revoke": revokeDevices,
}

export const account: Route = async (ctx) => {
  const { claims, record } = await requireSession(ctx)
  const body = await readJson(ctx.request)
  const handler = typeof body.op === "string" ? ACCOUNT_OPS[body.op] : undefined
  if (!handler) throw badRequest("Unknown operation.")
  return handler({ ctx, body, claims, record })
}

export function notConfigured(message: string): HttpError {
  return new HttpError(503, "mail_not_configured", message)
}
