/**
 * Per-vault server state that does not depend on the blob: lockout counters,
 * TOTP, email, outstanding email-link tokens, trusted devices, mail log.
 * Stored as meta/{name}.json and only ever updated by compare-and-swap.
 */

import { metaObjectKey } from "../src/shared/vaultName"
import { PreconditionFailedError, type ObjectStore } from "./store"

export type DeviceRecord = {
  id: string
  /** SHA-256 of the device secret (base64url). */
  h: string
  label: string
  /** Unix seconds. */
  created: number
  exp: number
  /** Failed password attempts presented with this device cookie. */
  fails: number
}

export type VaultMeta = {
  v: 1
  /** Vault id this state belongs to; a recreated vault starts fresh. */
  vid: string
  lock: { fails: number; until: number }
  /** Sealed TOTP secret and the last accepted time step (replay guard). */
  totp: { s: string; last: number } | null
  /** Sealed verified address. */
  email: { addr: string } | null
  /** Address awaiting confirmation by a mailed 6-digit code. */
  pendingEmail: { addr: string; code: string; exp: number; tries: number } | null
  /** Outstanding sign-in link tokens (SHA-256, expiry). */
  links: { h: string; exp: number }[]
  /** Unix seconds of recent sends (rate limit). */
  mail: number[]
  devices: DeviceRecord[]
}

export function emptyMeta(vid: string): VaultMeta {
  return {
    v: 1,
    vid,
    lock: { fails: 0, until: 0 },
    totp: null,
    email: null,
    pendingEmail: null,
    links: [],
    mail: [],
    devices: [],
  }
}

function isMeta(value: unknown): value is VaultMeta {
  if (!value || typeof value !== "object") return false
  const m = value as Partial<VaultMeta>
  return (
    m.v === 1 &&
    typeof m.vid === "string" &&
    !!m.lock &&
    Array.isArray(m.links) &&
    Array.isArray(m.mail) &&
    Array.isArray(m.devices)
  )
}

export async function loadMeta(
  store: ObjectStore,
  name: string,
  vid: string
): Promise<{ meta: VaultMeta; etag: string | null }> {
  const object = await store.get(metaObjectKey(name))
  if (!object) return { meta: emptyMeta(vid), etag: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(object.body))
  } catch {
    parsed = null
  }
  // Unreadable or belonging to an earlier vault of the same name: start fresh
  // but keep the etag so the next write replaces it.
  const meta = isMeta(parsed) && parsed.vid === vid ? parsed : emptyMeta(vid)
  return { meta, etag: object.etag }
}

export type MetaUpdate<T> = { value: T; changed: boolean }

/**
 * Read-modify-write with If-Match / If-None-Match, retried on lost races.
 * `mutate` must be safe to re-run on fresh state and should return
 * changed=false when there is nothing to write.
 */
export async function updateMeta<T>(
  store: ObjectStore,
  name: string,
  vid: string,
  mutate: (meta: VaultMeta) => MetaUpdate<T> | Promise<MetaUpdate<T>>,
  attempts = 3
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { meta, etag } = await loadMeta(store, name, vid)
    const { value, changed } = await mutate(meta)
    if (!changed) return value
    try {
      await store.put(
        metaObjectKey(name),
        new TextEncoder().encode(JSON.stringify(meta)),
        etag
          ? { ifMatch: etag, contentType: "application/json" }
          : { ifNoneMatch: "*", contentType: "application/json" }
      )
      return value
    } catch (error) {
      if (!(error instanceof PreconditionFailedError) || attempt >= attempts) throw error
    }
  }
}
