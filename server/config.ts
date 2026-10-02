/**
 * Server configuration from environment variables. None of these use the
 * VITE_ prefix, so Vite never inlines them into the browser bundle. In
 * Netlify, scope them to Functions and to the Production context.
 */

import { bytesEqual, utf8 } from "../src/shared/bytes"
import type { R2Config } from "./r2Store"
import { decodeServerSecret, sha256Base64Url } from "./secrets"

export type MailConfig = { apiKey: string; from: string; fromName: string }

export type ServerConfig = {
  serverSecret: Uint8Array
  /** Required to create vaults; creation is disabled when unset. */
  setupCode: string | null
  r2: R2Config | null
  mail: MailConfig | null
  /** Public site origin for links in emails (Netlify sets URL). */
  siteUrl: string | null
  /** netlify dev / local API: allows logging email links instead of sending. */
  dev: boolean
  backupIntervalHours: number
  backupRetentionDays: number
}

export type EnvGetter = (name: string) => string | undefined

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConfigError"
  }
}

/** Netlify Functions expose env through the global Netlify object. */
export function defaultEnvGetter(): EnvGetter {
  const netlify = (globalThis as { Netlify?: { env?: { get(name: string): string | undefined } } })
    .Netlify
  return (name) => netlify?.env?.get(name) ?? process.env[name]
}

function nonNegative(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function readConfig(get: EnvGetter, options: { requireR2?: boolean } = {}): ServerConfig {
  const secretText = get("CK_SERVER_SECRET")
  if (!secretText) throw new ConfigError("CK_SERVER_SECRET is not set")
  const serverSecret = decodeServerSecret(secretText)

  const r2Values = {
    accountId: get("R2_ACCOUNT_ID"),
    accessKeyId: get("R2_ACCESS_KEY_ID"),
    secretAccessKey: get("R2_SECRET_ACCESS_KEY"),
    bucket: get("R2_BUCKET"),
  }
  const r2Missing = Object.entries(r2Values)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (options.requireR2 && r2Missing.length > 0) {
    throw new ConfigError(`Missing R2 settings: ${r2Missing.join(", ")}`)
  }
  const r2: R2Config | null =
    r2Missing.length === 0
      ? {
          accountId: r2Values.accountId!,
          accessKeyId: r2Values.accessKeyId!,
          secretAccessKey: r2Values.secretAccessKey!,
          bucket: r2Values.bucket!,
          endpoint: get("R2_ENDPOINT") || undefined,
        }
      : null

  const apiKey = get("BREVO_API_KEY")
  const from = get("MAIL_FROM")
  const mail =
    apiKey && from ? { apiKey, from, fromName: get("MAIL_FROM_NAME") || "Credentials Keep" } : null

  const retention = nonNegative(get("VAULT_BACKUP_RETENTION_DAYS"), 7)
  return {
    serverSecret,
    setupCode: get("VAULT_SETUP_CODE") || null,
    r2,
    mail,
    siteUrl: (get("PUBLIC_SITE_URL") || get("URL") || "").replace(/\/$/, "") || null,
    dev: get("NETLIFY_DEV") === "true" || get("CK_LOCAL_API") === "true",
    backupIntervalHours: nonNegative(get("VAULT_BACKUP_INTERVAL_HOURS"), 8),
    backupRetentionDays: retention > 0 ? retention : 7,
  }
}

/** Constant-time setup-code check (hash first so lengths don't leak). */
export function setupCodeMatches(config: ServerConfig, candidate: string): boolean {
  if (!config.setupCode) return false
  return bytesEqual(
    utf8(sha256Base64Url(utf8(config.setupCode))),
    utf8(sha256Base64Url(utf8(candidate)))
  )
}
