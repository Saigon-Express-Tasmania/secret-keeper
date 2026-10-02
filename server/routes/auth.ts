/**
 * Session and step-up checks shared by the authenticated routes.
 */

import type { AuthRecord } from "../authRecord"
import type { RouteContext } from "../context"
import { badRequest, getBytes, HttpError, type JsonObject } from "../http"
import { lockSecondsAfter } from "../lockout"
import { updateMeta } from "../meta"
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
 * Re-verify the master password (authKey) or Recovery Key (rkAuth) for a
 * sensitive operation. Failures count toward the vault lockout.
 */
export async function verifyStepUp(
  ctx: RouteContext,
  name: string,
  record: AuthRecord,
  proof: unknown
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

  const outcome = await updateMeta<{ locked?: number; ok: boolean; retryAfter?: number }>(
    ctx.store,
    name,
    record.vid,
    (meta) => {
      if (meta.lock.until > now) {
        return { value: { ok: false, locked: meta.lock.until - now }, changed: false }
      }
      if (ok) {
        if (meta.lock.fails === 0) return { value: { ok: true }, changed: false }
        meta.lock = { fails: 0, until: 0 }
        return { value: { ok: true }, changed: true }
      }
      meta.lock.fails += 1
      const lockFor = lockSecondsAfter(meta.lock.fails)
      if (lockFor > 0) meta.lock.until = now + lockFor
      return {
        value: { ok: false, ...(lockFor > 0 ? { retryAfter: lockFor } : {}) },
        changed: true,
      }
    }
  )

  if (outcome.locked !== undefined) {
    throw new HttpError(429, "locked", "Too many failed attempts. Try again later.", {
      retryAfter: outcome.locked,
    })
  }
  if (!outcome.ok) {
    throw new HttpError(
      401,
      "step_up_failed",
      kind === "password" ? "Master password is incorrect." : "Recovery Key is incorrect.",
      outcome.retryAfter !== undefined ? { retryAfter: outcome.retryAfter } : {}
    )
  }
  return kind
}
