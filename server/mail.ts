/**
 * Outgoing email (sign-in links, verification codes, security notices).
 * Brevo transactional API in production; in local development without an
 * API key the message is printed to the server console instead.
 */

import type { ServerConfig } from "./config"

export type MailMessage = {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(message: MailMessage): Promise<void>
}

export class MailError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MailError"
  }
}

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"

export function createBrevoMailer(
  config: NonNullable<ServerConfig["mail"]>,
  fetchImpl: typeof fetch = fetch
): Mailer {
  return {
    async send(message) {
      const response = await fetchImpl(BREVO_ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": config.apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: config.from, name: config.fromName },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        throw new MailError(`Brevo rejected the message (${response.status}): ${detail.slice(0, 200)}`)
      }
    },
  }
}

/** Dev only: print instead of sending. */
export function createConsoleMailer(log: (message: string) => void = console.log): Mailer {
  return {
    async send(message) {
      log(`\n[mail] to=${message.to} subject=${message.subject}\n${message.text}\n`)
    },
  }
}

/**
 * Brevo when configured; console in development; otherwise null, and routes
 * that need email answer 503 mail_not_configured.
 */
export function createMailer(config: ServerConfig): Mailer | null {
  if (config.mail) return createBrevoMailer(config.mail)
  if (config.dev) return createConsoleMailer()
  return null
}
