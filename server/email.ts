/**
 * Email as a factor: sign-in links, address confirmation codes, and the
 * per-vault send limits that keep the free mail quota (and inboxes) safe.
 */

import { bytesEqual, fromBase64Url, randomBytes, toBase64Url } from "../src/shared/bytes"
import { badRequest, HttpError } from "./http"
import type { MailMessage } from "./mail"
import type { VaultMeta } from "./meta"
import { mac, type ServerKeys } from "./secrets"

export const LINK_TTL_SECONDS = 15 * 60
export const LINK_TOKEN_BYTES = 32
/** Older outstanding links are dropped when a new one is sent. */
export const MAX_OUTSTANDING_LINKS = 3
export const EMAIL_CODE_TTL_SECONDS = 15 * 60
export const EMAIL_CODE_MAX_TRIES = 5
export const MAIL_WINDOW_SECONDS = 15 * 60
export const MAIL_PER_WINDOW = 3
export const MAIL_PER_DAY = 10
const DAY_SECONDS = 24 * 60 * 60
const MAX_ADDRESS_LENGTH = 254

const ADDRESS_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:".]+(\.[^\s@<>()[\]\\,;:".]+)+$/

const hasControlCharacter = (text: string) =>
  [...text].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)

/** A plausible single address (no display name, no lists, no control characters). */
export function parseEmailAddress(text: string): string {
  const address = text.trim()
  if (
    address.length > MAX_ADDRESS_LENGTH ||
    hasControlCharacter(address) ||
    !ADDRESS_PATTERN.test(address)
  ) {
    throw badRequest("Enter a valid email address.")
  }
  return address
}

/** Uniform six-digit code (rejection sampling, no modulo bias). */
export function newEmailCode(): string {
  const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000
  for (;;) {
    const value = new DataView(randomBytes(4).buffer).getUint32(0)
    if (value < limit) return String(value % 1_000_000).padStart(6, "0")
  }
}

export function hashEmailCode(keys: ServerKeys, vaultId: string, code: string): string {
  return toBase64Url(mac(keys.verifier, "email-code", vaultId, code))
}

export function emailCodeMatches(keys: ServerKeys, vaultId: string, code: string, stored: string): boolean {
  const expected = mac(keys.verifier, "email-code", vaultId, code)
  try {
    return bytesEqual(expected, fromBase64Url(stored, expected.byteLength))
  } catch {
    return false
  }
}

/**
 * Seconds until this vault may send another email (0 = now). Prunes the
 * send log in place; callers append the send time when they do send.
 */
export function mailWait(meta: VaultMeta, nowSeconds: number): number {
  meta.mail = meta.mail.filter((sent) => sent > nowSeconds - DAY_SECONDS).sort((a, b) => a - b)
  const recent = meta.mail.filter((sent) => sent > nowSeconds - MAIL_WINDOW_SECONDS)
  if (recent.length >= MAIL_PER_WINDOW) return recent[0]! + MAIL_WINDOW_SECONDS - nowSeconds
  if (meta.mail.length >= MAIL_PER_DAY) return meta.mail[0]! + DAY_SECONDS - nowSeconds
  return 0
}

export function tooManyEmails(retryAfter: number): HttpError {
  return new HttpError(429, "rate_limited", "Too many emails for this vault. Try again later.", {
    retryAfter,
  })
}

export function mailFailed(): HttpError {
  return new HttpError(502, "mail_failed", "The email could not be sent. Try again later.")
}

export function mailNotConfigured(): HttpError {
  return new HttpError(503, "mail_not_configured", "Email is not set up on this server.")
}

export function newLinkToken(): Uint8Array {
  return randomBytes(LINK_TOKEN_BYTES)
}

/**
 * The token travels in the fragment, so it never reaches a server log or a
 * Referer header; the page reads it and removes it from the address bar.
 */
export function signInLink(siteUrl: string, vault: string, token: Uint8Array): string {
  return `${siteUrl}/verify#v=${encodeURIComponent(vault)}&t=${toBase64Url(token)}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function signInLinkMessage(to: string, vault: string, link: string): MailMessage {
  const minutes = LINK_TTL_SECONDS / 60
  const intro = `Someone entered the correct master password for the vault “${vault}” on a device that is not trusted yet, and asked for a sign-in link.`
  const how = `Open the link on that device within ${minutes} minutes and enter your master password again. It works once.`
  const warning =
    "If this wasn't you, don't open the link: whoever asked knows your master password. Change it from a trusted device."
  return {
    to,
    subject: `Credentials Keep: sign-in link for ${vault}`,
    text: [intro, how, link, warning].join("\n\n"),
    html: [
      `<p>${escapeHtml(intro)}</p>`,
      `<p>${escapeHtml(how)}</p>`,
      `<p><a href="${escapeHtml(link)}">Unlock “${escapeHtml(vault)}”</a></p>`,
      `<p>${escapeHtml(warning)}</p>`,
    ].join(""),
  }
}

export function confirmCodeMessage(to: string, vault: string, code: string): MailMessage {
  const lines = [
    `Your code to confirm this address for the vault “${vault}” is ${code}.`,
    `It expires in ${EMAIL_CODE_TTL_SECONDS / 60} minutes. If you didn't ask for it, ignore this email.`,
  ]
  return {
    to,
    subject: `Credentials Keep: confirmation code ${code}`,
    text: lines.join("\n\n"),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
  }
}
