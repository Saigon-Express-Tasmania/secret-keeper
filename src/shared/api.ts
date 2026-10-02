/**
 * Wire contract between the browser and the vault Function (/api/vault/*).
 * Binary payloads (vault blobs) travel in frames, see ./frame.ts.
 */

import type { Ckv3Kdf } from "./ckv3"

export const API_PREFIX = "/api/vault"
/** Required on every request: a simple CSRF guard plain forms cannot send. */
export const CLIENT_HEADER = "x-ck-client"
export const CLIENT_HEADER_VALUE = "1"

export const API_ERROR_CODES = [
  "bad_request",
  "bad_origin",
  "not_found",
  "method_not_allowed",
  "payload_too_large",
  "bad_credentials",
  "second_factor_required",
  "bad_second_factor",
  "locked",
  "session_expired",
  "step_up_failed",
  "conflict",
  "exists",
  "bad_setup_code",
  "setup_disabled",
  "bad_blob",
  "email_not_set",
  "mail_failed",
  "mail_not_configured",
  "rate_limited",
  "server_misconfigured",
  "server_error",
] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export type SecondFactorMethod = "totp" | "email"

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode
    message: string
    /** Seconds until a lockout or rate limit ends. */
    retryAfter?: number
    /** For second_factor_required: what this vault accepts. */
    methods?: SecondFactorMethod[]
    /** For conflict: the current version on the server. */
    etag?: string
    rev?: number
  }
}

/** Proof of the master password (or Recovery Key) for sensitive operations. */
export type StepUpProof = { authKey: string } | { rkAuth: string }

// --- prelogin ---------------------------------------------------------------

export type PreloginRequest = { vault: string }
export type PreloginResponse = { kdf: Ckv3Kdf }

// --- unlock -----------------------------------------------------------------

export type UnlockRequest =
  | {
      vault: string
      mode: "password"
      authKey: string
      totp?: string
      emailToken?: string
      trustDevice?: boolean
      deviceLabel?: string
    }
  | {
      vault: string
      mode: "recovery"
      rkAuth: string
      trustDevice?: boolean
      deviceLabel?: string
    }

export type AccountSummary = {
  totp: boolean
  /** Masked address, e.g. p•••@example.com; null when no verified email. */
  email: string | null
  emailUnlock: boolean
}

export type SessionGrant = {
  session: string
  /** Unix seconds. */
  sessionExp: number
}

/** JSON part of the unlock frame; the vault blob follows it. */
export type UnlockResponse = SessionGrant & {
  etag: string
  rev: number
  /** Server share P for the primary slot (base64url). */
  srvShare: string
  /** Server share E, only after a successful email-link unlock. */
  emailShare?: string
  account: AccountSummary
  device: { trusted: boolean; exp?: number }
}

// --- create -----------------------------------------------------------------

/** JSON part of the create frame; the new vault blob follows it. */
export type CreateRequest = {
  vault: string
  setupCode: string
  authKey: string
  rkAuth: string
  srvShare: string
}
export type CreateResponse = SessionGrant & { etag: string; rev: number }

// --- blob -------------------------------------------------------------------

/** JSON part of GET /blob; the blob follows it. */
export type BlobResponse = { etag: string; rev: number }

export type RekeyRequest = {
  proof: StepUpProof
  /** Required when the password (KDF salt/params) changes. */
  newAuthKey?: string
  /** Required when the Recovery Key changes. */
  newRkAuth?: string
  /** Fresh primary-slot share P′ (always rotated on re-key). */
  srvShare: string
  /** Fresh email-slot share E′, or null when the vault has no email slot. */
  emailShare: string | null
  /** Revoke every trusted device (e.g. after a suspected compromise). */
  revokeDevices?: boolean
}

/** JSON part of PUT /blob; the new blob follows it. */
export type PutBlobRequest = {
  ifMatch: string
  rekey?: RekeyRequest
}
export type PutBlobResponse = SessionGrant & { etag: string; rev: number }

// --- account ----------------------------------------------------------------

export type DeviceInfo = {
  id: string
  label: string
  created: number
  exp: number
  current: boolean
}

export type AccountStatus = AccountSummary & {
  pendingEmail: string | null
  devices: DeviceInfo[]
}

export type AccountRequest =
  | { op: "status" }
  | { op: "totp.enable"; proof: StepUpProof; secret: string; code: string; deviceLabel?: string }
  | { op: "totp.disable"; proof: StepUpProof; code?: string }
  | { op: "email.set"; proof: StepUpProof; email: string }
  | { op: "email.confirm"; code: string }
  | { op: "email.remove"; proof: StepUpProof }
  | { op: "devices.revoke"; proof: StepUpProof; id: string }

// --- email link -------------------------------------------------------------

export type EmailLinkRequest = { vault: string; authKey: string }
export type EmailLinkResponse = { to: string; ttl: number }

// --- device -----------------------------------------------------------------

export type DeviceForgetRequest = { vault: string }
