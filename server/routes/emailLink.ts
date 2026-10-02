/**
 * POST /email-link — mail a one-time sign-in link to the vault's verified
 * address. Needs the master password proof (authKey), so the email itself
 * tells the owner that someone knows the password.
 *
 * The link only works inside a successful /unlock with the password again;
 * opening it (or a mail scanner fetching it) consumes nothing.
 */

import type { EmailLinkResponse } from "../../src/shared/api"
import type { Route } from "../context"
import {
  LINK_TTL_SECONDS,
  MAX_OUTSTANDING_LINKS,
  mailFailed,
  mailNotConfigured,
  mailWait,
  newLinkToken,
  signInLink,
  signInLinkMessage,
  tooManyEmails,
} from "../email"
import { getBytes, HttpError, jsonResponse, readJson } from "../http"
import { recordFailure } from "../lockout"
import { updateMeta } from "../meta"
import { checkVerifier, unseal } from "../secrets"
import { hashLinkToken, maskEmail } from "../twoFactor"
import { loadAuthRecord, vaultNameFrom } from "./common"

const INVALID = "Invalid vault name or credentials."

type Outcome =
  | { kind: "ok"; sealedAddress: string }
  | { kind: "locked" | "bad_credentials" | "rate_limited"; retryAfter: number }
  | { kind: "email_not_set" }

export const emailLink: Route = async (ctx) => {
  const body = await readJson(ctx.request)
  const name = vaultNameFrom(body)
  const authKey = getBytes(body, "authKey", 32)
  const mailer = ctx.mailer
  if (!mailer) throw mailNotConfigured()

  const found = await loadAuthRecord(ctx, name)
  if (!found) throw new HttpError(401, "bad_credentials", INVALID)
  const { record } = found
  const ok = checkVerifier(ctx.keys, record.av, "password", record.vid, authKey)
  const now = ctx.nowSeconds()
  const token = newLinkToken()

  const outcome = await updateMeta<Outcome>(ctx.store, name, record.vid, (meta) => {
    if (meta.lock.until > now) {
      return { value: { kind: "locked", retryAfter: meta.lock.until - now }, changed: false }
    }
    if (!ok) {
      return {
        value: { kind: "bad_credentials", retryAfter: recordFailure(meta.lock, now) },
        changed: true,
      }
    }
    // A right password does not reset the lockout here: only a full unlock
    // does, so link requests cannot be used to reset failed code guesses.
    if (!meta.email) return { value: { kind: "email_not_set" }, changed: false }
    const wait = mailWait(meta, now)
    if (wait > 0) return { value: { kind: "rate_limited", retryAfter: wait }, changed: false }
    meta.mail.push(now)
    meta.links = [
      ...meta.links.filter((link) => link.exp > now),
      { h: hashLinkToken(token), exp: now + LINK_TTL_SECONDS },
    ].slice(-MAX_OUTSTANDING_LINKS)
    return { value: { kind: "ok", sealedAddress: meta.email.addr }, changed: true }
  })

  switch (outcome.kind) {
    case "locked":
      throw new HttpError(429, "locked", "Too many failed attempts. Try again later.", {
        retryAfter: outcome.retryAfter,
      })
    case "bad_credentials":
      throw new HttpError(
        401,
        "bad_credentials",
        INVALID,
        outcome.retryAfter > 0 ? { retryAfter: outcome.retryAfter } : {}
      )
    case "email_not_set":
      throw new HttpError(409, "email_not_set", "This vault has no confirmed email address.")
    case "rate_limited":
      throw tooManyEmails(outcome.retryAfter)
  }

  const address = new TextDecoder().decode(
    await unseal(ctx.keys, [name, record.vid, "email"], outcome.sealedAddress)
  )
  const link = signInLink(ctx.config.siteUrl ?? ctx.url.origin, name, token)
  try {
    await mailer.send(signInLinkMessage(address, name, link))
  } catch (error) {
    ctx.log(`sign-in link mail failed: ${error instanceof Error ? error.message : String(error)}`)
    throw mailFailed()
  }
  const response: EmailLinkResponse = { to: maskEmail(address), ttl: LINK_TTL_SECONDS }
  return jsonResponse(200, response)
}
