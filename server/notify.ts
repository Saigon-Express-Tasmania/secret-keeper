/**
 * Security notification emails. Sent after the response (waitUntil) and
 * only when the vault has a verified email address and mail is configured.
 */

import type { RouteContext } from "./context"
import type { MailMessage } from "./mail"
import { loadMeta } from "./meta"
import { unseal } from "./secrets"

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function plainMessage(to: string, subject: string, lines: string[]): MailMessage {
  const text = lines.join("\n\n")
  const html = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
  return { to, subject, text, html }
}

async function verifiedAddress(
  ctx: RouteContext,
  name: string,
  vid: string
): Promise<string | null> {
  const { meta } = await loadMeta(ctx.store, name, vid)
  if (!meta.email) return null
  return new TextDecoder().decode(await unseal(ctx.keys, [name, vid, "email"], meta.email.addr))
}

async function notify(
  ctx: RouteContext,
  name: string,
  vid: string,
  subject: string,
  lines: string[],
  to?: string
): Promise<void> {
  if (!ctx.mailer) return
  const address = to ?? (await verifiedAddress(ctx, name, vid))
  if (!address) return
  const when = new Date(ctx.nowMs()).toUTCString()
  await ctx.mailer.send(
    plainMessage(address, `Credentials Keep: ${subject}`, [
      ...lines,
      `Vault: ${name} — ${when}.`,
      "If this wasn't you, sign in from a trusted device, change your master password and revoke other devices.",
    ])
  )
}

export const notifyRecoveryUsed = (ctx: RouteContext, name: string, vid: string) =>
  notify(ctx, name, vid, "Recovery Key used", [
    "Your Recovery Key was just used to unlock your vault.",
  ])

export const notifyNewDevice = (ctx: RouteContext, name: string, vid: string, label: string) =>
  notify(ctx, name, vid, "new trusted device", [
    `A device (${label}) was trusted for 30 days after passing a second factor.`,
  ])

export const notifyPasswordChanged = (ctx: RouteContext, name: string, vid: string) =>
  notify(ctx, name, vid, "security settings changed", [
    "Your vault keys or master password were changed. Other sessions were signed out.",
  ])

export const notifyTotpDisabled = (ctx: RouteContext, name: string, vid: string) =>
  notify(ctx, name, vid, "authenticator app removed", [
    "Two-step verification with an authenticator app was turned off for your vault.",
  ])

export const notifyEmailChanged = (
  ctx: RouteContext,
  name: string,
  vid: string,
  previousAddress: string
) =>
  notify(
    ctx,
    name,
    vid,
    "email address changed",
    ["The email address for your vault was changed or removed."],
    previousAddress
  )
