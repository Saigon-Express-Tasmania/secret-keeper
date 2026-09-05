/**
 * KeePass-style account entry stored as the decrypted JSON body of a vault file.
 * The archive VFS does not enforce this shape — parse/serialize live here.
 */

import type { JsonValue } from "@/lib/vault/fs"

export type OtpAlgorithm = "SHA1" | "SHA256" | "SHA512"
export type OtpDigits = 6 | 7 | 8
export type OtpType = "totp" | "hotp"

export type OtpSettings = {
  type: OtpType
  /** Base32 secret (spaces allowed in UI; stored as entered, trimmed). */
  secret: string
  algorithm: OtpAlgorithm
  digits: OtpDigits
  /** TOTP step in seconds. */
  period: number
  /** HOTP moving factor. */
  counter: number
  issuer: string
  label: string
}

export type AccountEntry = {
  type: "account"
  id: string
  title: string
  description: string
  username: string
  password: string
  url: string
  recoveryEmail: string
  recoveryKeys: string[]
  notes: string
  otp: OtpSettings | null
  createdAt: string
  updatedAt: string
  /** Unknown keys preserved across save so we do not wipe unexpected data. */
  extra?: Record<string, JsonValue>
}

const KNOWN_KEYS = new Set([
  "type",
  "id",
  "title",
  "description",
  "username",
  "password",
  "url",
  "recoveryEmail",
  "recoveryKeys",
  "notes",
  "otp",
  "createdAt",
  "updatedAt",
  "extra",
  // legacy
  "tags",
  "body",
  "kind",
  "secret",
  "issuer",
  "network",
  "address",
  "privateKey",
  "seedPhrase",
])

function nowIso(): string {
  return new Date().toISOString()
}

function asRecord(json: JsonValue): Record<string, JsonValue> | null {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return null
  }
  return json as Record<string, JsonValue>
}

function asString(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function asStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === "string")
}

function newId(): string {
  return crypto.randomUUID()
}

export function createEmptyOtp(type: OtpType = "totp"): OtpSettings {
  return {
    type,
    secret: "",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    counter: 0,
    issuer: "",
    label: "",
  }
}

export function createEmptyAccount(
  overrides?: Partial<Pick<AccountEntry, "title">>
): AccountEntry {
  const t = nowIso()
  return {
    type: "account",
    id: newId(),
    title: overrides?.title ?? "",
    description: "",
    username: "",
    password: "",
    url: "",
    recoveryEmail: "",
    recoveryKeys: [],
    notes: "",
    otp: null,
    createdAt: t,
    updatedAt: t,
  }
}

function parseDigits(value: JsonValue | undefined): OtpDigits {
  if (value === 7 || value === 8 || value === 6) return value
  if (value === "7") return 7
  if (value === "8") return 8
  return 6
}

function parseAlgorithm(value: JsonValue | undefined): OtpAlgorithm {
  const s = asString(value).toUpperCase().replace(/-/g, "")
  if (s === "SHA256") return "SHA256"
  if (s === "SHA512") return "SHA512"
  return "SHA1"
}

function parseOtp(value: JsonValue | undefined): OtpSettings | null {
  const obj = value === undefined ? null : asRecord(value)
  if (!obj) return null
  const typeRaw = asString(obj.type, "totp").toLowerCase()
  const type: OtpType = typeRaw === "hotp" ? "hotp" : "totp"
  const period =
    typeof obj.period === "number" && obj.period > 0 ? obj.period : 30
  const counter =
    typeof obj.counter === "number" && obj.counter >= 0
      ? Math.floor(obj.counter)
      : 0
  return {
    type,
    secret: asString(obj.secret),
    algorithm: parseAlgorithm(obj.algorithm),
    digits: parseDigits(obj.digits),
    period,
    counter,
    issuer: asString(obj.issuer),
    label: asString(obj.label),
  }
}

function collectExtra(obj: Record<string, JsonValue>): Record<string, JsonValue> | undefined {
  const extra: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_KEYS.has(key)) {
      extra[key] = value
    }
  }
  const nested = asRecord(obj.extra)
  if (nested) {
    for (const [key, value] of Object.entries(nested)) {
      if (!(key in extra)) extra[key] = value
    }
  }
  return Object.keys(extra).length > 0 ? extra : undefined
}

/**
 * Map decrypted JSON (including empty `{}` and legacy password/auth_key shapes)
 * into a full AccountEntry for the editor.
 */
export function parseAccount(json: JsonValue): AccountEntry {
  const obj = asRecord(json)
  if (!obj || Object.keys(obj).length === 0) {
    return createEmptyAccount()
  }

  const type = asString(obj.type)
  const t = nowIso()
  const id = asString(obj.id) || newId()
  const createdAt = asString(obj.createdAt) || t
  const updatedAt = asString(obj.updatedAt) || createdAt
  const title = asString(obj.title)
  const notes = asString(obj.notes)
  const extra = collectExtra(obj)

  // Legacy password item
  if (type === "password") {
    return {
      type: "account",
      id,
      title,
      description: "",
      username: asString(obj.username),
      password: asString(obj.password),
      url: asString(obj.url),
      recoveryEmail: "",
      recoveryKeys: [],
      notes,
      otp: null,
      createdAt,
      updatedAt,
      ...(extra ? { extra } : {}),
    }
  }

  // Legacy auth_key (including kind: totp)
  if (type === "auth_key") {
    const kind = asString(obj.kind).toLowerCase()
    const secret = asString(obj.secret)
    const issuer = asString(obj.issuer)
    let otp: OtpSettings | null = null
    if (kind === "totp" || kind === "hotp") {
      otp = {
        ...createEmptyOtp(kind === "hotp" ? "hotp" : "totp"),
        secret,
        issuer,
        label: title,
      }
    }
    return {
      type: "account",
      id,
      title,
      description: kind && kind !== "totp" && kind !== "hotp" ? kind : "",
      username: "",
      password: kind === "totp" || kind === "hotp" ? "" : secret,
      url: "",
      recoveryEmail: "",
      recoveryKeys: kind === "recovery" && secret ? [secret] : [],
      notes,
      otp,
      createdAt,
      updatedAt,
      ...(extra ? { extra } : {}),
    }
  }

  // Legacy note
  if (type === "note") {
    return {
      type: "account",
      id,
      title,
      description: "",
      username: "",
      password: "",
      url: "",
      recoveryEmail: "",
      recoveryKeys: [],
      notes: asString(obj.body) || notes,
      otp: null,
      createdAt,
      updatedAt,
      ...(extra ? { extra } : {}),
    }
  }

  // Legacy wallet — surface secrets in notes / password; keep rest in extra
  if (type === "wallet") {
    const walletExtra: Record<string, JsonValue> = { ...(extra ?? {}) }
    for (const key of ["network", "address", "privateKey", "seedPhrase"] as const) {
      if (obj[key] !== undefined) walletExtra[key] = obj[key]!
    }
    const seed = asString(obj.seedPhrase)
    const priv = asString(obj.privateKey)
    return {
      type: "account",
      id,
      title,
      description: asString(obj.network),
      username: asString(obj.address),
      password: priv,
      url: "",
      recoveryEmail: "",
      recoveryKeys: [],
      notes: [notes, seed ? `Seed phrase:\n${seed}` : ""].filter(Boolean).join("\n\n"),
      otp: null,
      createdAt,
      updatedAt,
      ...(Object.keys(walletExtra).length > 0 ? { extra: walletExtra } : {}),
    }
  }

  // Canonical account (or unknown type treated as account fields)
  return {
    type: "account",
    id,
    title,
    description: asString(obj.description),
    username: asString(obj.username),
    password: asString(obj.password),
    url: asString(obj.url),
    recoveryEmail: asString(obj.recoveryEmail),
    recoveryKeys: asStringArray(obj.recoveryKeys),
    notes,
    otp: parseOtp(obj.otp),
    createdAt,
    updatedAt,
    ...(extra ? { extra } : {}),
  }
}

/** Serialize for encrypt+save. Omits empty `extra`. Updates `updatedAt`. */
export function serializeAccount(entry: AccountEntry): JsonValue {
  const out: Record<string, JsonValue> = {
    type: "account",
    id: entry.id,
    title: entry.title,
    description: entry.description,
    username: entry.username,
    password: entry.password,
    url: entry.url,
    recoveryEmail: entry.recoveryEmail,
    recoveryKeys: [...entry.recoveryKeys],
    notes: entry.notes,
    otp: entry.otp
      ? {
          type: entry.otp.type,
          secret: entry.otp.secret,
          algorithm: entry.otp.algorithm,
          digits: entry.otp.digits,
          period: entry.otp.period,
          counter: entry.otp.counter,
          issuer: entry.otp.issuer,
          label: entry.otp.label,
        }
      : null,
    createdAt: entry.createdAt,
    updatedAt: nowIso(),
  }
  if (entry.extra && Object.keys(entry.extra).length > 0) {
    out.extra = entry.extra
  }
  return out
}

/** Deep-equality check for dirty tracking (stable JSON stringify). */
export function accountsEqual(a: AccountEntry, b: AccountEntry): boolean {
  return JSON.stringify(serializeForCompare(a)) === JSON.stringify(serializeForCompare(b))
}

function serializeForCompare(entry: AccountEntry): JsonValue {
  // Ignore updatedAt drift when comparing form state to last-saved snapshot
  const { updatedAt: _u, ...rest } = entry
  void _u
  return rest as unknown as JsonValue
}
