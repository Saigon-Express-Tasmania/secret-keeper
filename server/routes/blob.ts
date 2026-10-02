/**
 * GET /blob — current vault blob for a valid session.
 * PUT /blob — save (frame: JSON + CKV3 blob).
 *
 * Every save must be the next revision of the same vault and match the
 * stored ETag (compare-and-swap). An ordinary save may only change the body;
 * changing the KDF, slots or passkeys is a re-key and needs step-up proof,
 * a fresh server share, and bumps the auth epoch (ending other sessions).
 */

import type { BlobResponse, PutBlobResponse } from "../../src/shared/api"
import { parseCkv3, slotStructureHash, type Ckv3Header } from "../../src/shared/ckv3"
import { vaultObjectKey } from "../../src/shared/vaultName"
import { decodeAuthRecord, encodeAuthRecord, type AuthRecord } from "../authRecord"
import { backupCurrent, backupDue, pruneBackups, pruneDue } from "../backups"
import type { Route, RouteContext } from "../context"
import {
  badRequest,
  frameResponse,
  getBoolean,
  getBytes,
  getObject,
  getString,
  HttpError,
  jsonResponse,
  readFrame,
  type JsonObject,
} from "../http"
import { updateMeta } from "../meta"
import { notifyPasswordChanged } from "../notify"
import { makeVerifier, seal } from "../secrets"
import { bearerToken, issueSession, SESSION_TTL_SECONDS } from "../session"
import { PreconditionFailedError } from "../store"
import { requireSession, sessionExpired, verifyStepUp } from "./auth"
import { badBlob, MAX_FRAME_BYTES } from "./create"

export const getBlob: Route = async (ctx) => {
  const { claims } = await requireSession(ctx)
  const object = await ctx.store.get(vaultObjectKey(claims.n))
  const record = object ? decodeAuthRecord(object.meta) : null
  if (!object || !record || record.vid !== claims.vid || record.ae !== claims.ae) {
    throw sessionExpired()
  }
  const body: BlobResponse = { etag: object.etag, rev: record.rev }
  return frameResponse(200, body, object.body)
}

async function conflict(ctx: RouteContext, name: string): Promise<HttpError> {
  const head = await ctx.store.head(vaultObjectKey(name))
  const record = head ? decodeAuthRecord(head.meta) : null
  return new HttpError(409, "conflict", "The vault was changed elsewhere.", {
    ...(head ? { etag: head.etag } : {}),
    ...(record ? { rev: record.rev } : {}),
  })
}

function kdfEqual(a: Ckv3Header["kdf"], b: AuthRecord["kdf"]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export const putBlob: Route = async (ctx) => {
  const { claims, record, etag: currentEtag } = await requireSession(ctx)
  const name = claims.n
  const { json, blob } = await readFrame(ctx.request, MAX_FRAME_BYTES)
  const ifMatch = getString(json, "ifMatch", { max: 200 })
  if (ifMatch !== currentEtag) throw await conflict(ctx, name)

  let header: Ckv3Header
  try {
    header = parseCkv3(blob).header
  } catch (error) {
    throw badBlob(error instanceof Error ? error.message : "Invalid vault file.")
  }
  if (header.purpose !== "vault" || header.vaultId !== record.vid) {
    throw badBlob("This file belongs to a different vault.")
  }
  if (header.rev !== record.rev + 1) {
    throw badBlob(`Expected revision ${record.rev + 1}, got ${header.rev}.`)
  }

  const now = ctx.nowSeconds()
  const sh = await slotStructureHash(header)
  const next: AuthRecord = { ...record, rev: header.rev }
  let isRekey = false
  let revokeDevices = false

  if (json.rekey === undefined) {
    if (sh !== record.sh || !kdfEqual(header.kdf, record.kdf)) {
      throw badBlob("Changing keys requires confirming your master password.")
    }
  } else {
    isRekey = true
    const rekey: JsonObject = getObject(json, "rekey")
    await verifyStepUp(ctx, name, record, rekey.proof)

    const kdfChanged = !kdfEqual(header.kdf, record.kdf)
    const newAuthKey =
      rekey.newAuthKey !== undefined ? getBytes(rekey, "newAuthKey", 32) : undefined
    if (kdfChanged !== (newAuthKey !== undefined)) {
      throw badRequest("A password change must come with a new KDF salt and auth key.")
    }
    if (newAuthKey) next.av = makeVerifier(ctx.keys, "password", record.vid, newAuthKey)
    if (rekey.newRkAuth !== undefined) {
      next.rv = makeVerifier(ctx.keys, "recovery", record.vid, getBytes(rekey, "newRkAuth", 32))
    }
    next.kdf = header.kdf!
    next.sh = sh

    next.sp = await seal(ctx.keys, [name, record.vid, "sp"], getBytes(rekey, "srvShare", 32))
    const hasEmailSlot = header.slots.some((slot) => slot.type === "email")
    if (rekey.emailShare === null || rekey.emailShare === undefined) {
      if (hasEmailSlot) throw badRequest("An email slot needs a fresh email share.")
      delete next.se
    } else {
      if (!hasEmailSlot) throw badRequest("Email share sent without an email slot.")
      next.se = await seal(ctx.keys, [name, record.vid, "se"], getBytes(rekey, "emailShare", 32))
    }
    next.ae = record.ae + 1
    revokeDevices = getBoolean(rekey, "revokeDevices")
  }

  // Back up the current version first: always before a re-key, else when due.
  if (backupDue(record.bk, now, ctx.config.backupIntervalHours, isRekey)) {
    await backupCurrent(ctx.store, name, ctx.nowMs())
    next.bk = now
  }
  const shouldPrune = pruneDue(record.pr, now)
  if (shouldPrune) next.pr = now

  let etag: string
  try {
    ;({ etag } = await ctx.store.put(vaultObjectKey(name), blob, {
      ifMatch: currentEtag,
      meta: encodeAuthRecord(next),
    }))
  } catch (error) {
    if (error instanceof PreconditionFailedError) throw await conflict(ctx, name)
    throw error
  }

  if (shouldPrune) {
    ctx.waitUntil(pruneBackups(ctx.store, name, ctx.nowMs(), ctx.config.backupRetentionDays))
  }
  if (revokeDevices) {
    ctx.waitUntil(
      updateMeta(ctx.store, name, record.vid, (meta) => {
        meta.devices = []
        return { value: null, changed: true }
      })
    )
  }
  if (isRekey) ctx.waitUntil(notifyPasswordChanged(ctx, name, record.vid))

  let session = bearerToken(ctx.request)!
  let sessionExp = claims.exp
  if (isRekey) {
    sessionExp = now + SESSION_TTL_SECONDS
    session = issueSession(ctx.keys, {
      n: name,
      vid: record.vid,
      ae: next.ae,
      exp: sessionExp,
      ...(claims.did ? { did: claims.did } : {}),
    })
  }
  const body: PutBlobResponse = { etag, rev: next.rev, session, sessionExp }
  return jsonResponse(200, body)
}
