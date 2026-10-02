/**
 * Session and step-up checks shared by the authenticated routes.
 */

import type { AuthRecord } from "../authRecord"
import type { RouteContext } from "../context"
import { badRequest, getBytes, HttpError, type JsonObject } from "../http"
import { recordFailure } from "../lockout"
import { updateMeta, type VaultMeta } from "../meta"
import { checkVerifier } from "../secrets"
import { bearerToken, verifySession, type SessionClaims } from "../session"
import { loadAuthRecord } from "./common"

export function sessionExpired(): HttpError {
  return new HttpError(401, "session_expired", "Your session ended. Unlock the vault again.")
}

/** Valid session whose vault id and auth epoch still match the stored record. */
export async function requireSession(
  ctx: RouteContext
): Promise<{ claims: SessionClaims; record: AuthRecord; etag: string }> {
  const claims = verifySession(ctx.keys, bearerToken(ctx.request), ctx.nowSeconds())
  if (!claims) throw sessionExpired()
  const found = await loadAuthRecord(ctx, claims.n)
  if (!found || found.record.vid !== claims.vid || found.record.ae !== claims.ae) {
    throw sessionExpired()
  }
  return { claims, ...found }
}

export type StepUpKind = "password" | "recovery"

/**
 * Extra check run inside the step-up transaction once the proof is good,
 * e.g. a TOTP code. Returning false counts as a failed attempt. It may
 * change `meta`, but only when it returns true.
 */
export type StepUpExtra = (meta: VaultMeta, kind: StepUpKind) => Promise<boolean> | boolean

/**
 * Re-verify the master password (authKey) or Recovery Key (rkAuth) for a
 * sensitive operation. Failures count toward the vault lockout and success
 * resets it, in the same compare-and-swap as `extra` (so a right password
 * with a wrong code still counts).
 */
export async function verifyStepUp(
  ctx: RouteContext,
  name: string,
  record: AuthRecord,
  proof: unknown,
  extra?: StepUpExtra
): Promise<StepUpKind> {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    throw badRequest("Missing confirmation.")
  }
  const p = proof as JsonObject
  const kind: StepUpKind | null =
    p.authKey !== undefined ? "password" : p.rkAuth !== undefined ? "recovery" : null
  if (!kind) throw badRequest("Missing confirmation.")
  const credential = getBytes(p, kind === "password" ? "authKey" : "rkAuth", 32)
  const ok = checkVerifier(
    ctx.keys,
    kind === "password" ? record.av : record.rv,
    kind,
    record.vid,
    credential
  )
  const now = ctx.nowSeconds()

  type Outcome =
    | { kind: "ok" }
    | { kind: "locked" | "step_up_failed" | "bad_second_factor"; retryAfter: number }
  const outcome = await updateMeta<Outcome>(ctx.store, name, record.vid, async (meta) => {
    if (meta.lock.until > now) {
      return { value: { kind: "locked", retryAfter: meta.lock.until - now }, changed: false }
    }
    if (!ok) {
      return {
        value: { kind: "step_up_failed", retryAfter: recordFailure(meta.lock, now) },
        changed: true,
      }
    }
    if (extra && !(await extra(meta, kind))) {
      return {
        value: { kind: "bad_second_factor", retryAfter: recordFailure(meta.lock, now) },
        changed: true,
      }
    }
    const reset = meta.lock.fails !== 0 || meta.lock.until !== 0
    if (reset) meta.lock = { fails: 0, until: 0 }
    return { value: { kind: "ok" }, changed: reset || extra !== undefined }
  })

  if (outcome.kind === "ok") return kind
  const retry = outcome.retryAfter > 0 ? { retryAfter: outcome.retryAfter } : {}
  switch (outcome.kind) {
    case "locked":
      throw new HttpError(429, "locked", "Too many failed attempts. Try again later.", retry)
    case "bad_second_factor":
      throw new HttpError(
        401,
        "bad_second_factor",
        "That code is not valid (or was already used). Check the time on your phone.",
        retry
      )
    case "step_up_failed":
      throw new HttpError(
        401,
        "step_up_failed",
        kind === "password" ? "Master password is incorrect." : "Recovery Key is incorrect.",
        retry
      )
  }
}
