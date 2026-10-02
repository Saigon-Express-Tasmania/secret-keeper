/**
 * POST /device/forget — this browser stops being a trusted device for the
 * vault: its record is removed and the cookie cleared. Possession of the
 * cookie is the only authorization needed (it can only remove itself).
 */

import type { Route } from "../context"
import {
  deviceCookieName,
  hashDeviceSecret,
  parseDeviceToken,
  readCookie,
  serializeCookie,
} from "../cookies"
import { jsonResponse, readJson } from "../http"
import { updateMeta } from "../meta"
import { loadAuthRecord, vaultNameFrom } from "./common"

export const forgetDevice: Route = async (ctx) => {
  const name = vaultNameFrom(await readJson(ctx.request))
  const cookieName = deviceCookieName(name, ctx.secure)
  const token = parseDeviceToken(readCookie(ctx.request.headers.get("cookie"), cookieName))
  const found = await loadAuthRecord(ctx, name)
  if (token && found) {
    const hash = hashDeviceSecret(token.secret)
    await updateMeta(ctx.store, name, found.record.vid, (meta) => {
      const before = meta.devices.length
      meta.devices = meta.devices.filter((d) => !(d.id === token.id && d.h === hash))
      return { value: null, changed: meta.devices.length !== before }
    })
  }
  const headers = new Headers()
  headers.append("set-cookie", serializeCookie(cookieName, "", { secure: ctx.secure, maxAge: 0 }))
  return jsonResponse(200, { ok: true }, headers)
}
