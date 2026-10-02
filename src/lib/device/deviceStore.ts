/**
 * What a trusted device remembers about a vault, in localStorage:
 * the Secret Key and the highest revision seen (rollback detection).
 * Kept for a fixed 30 days from when the device was trusted, then wiped.
 * Untrusted devices store nothing.
 */

import { fromBase64Url, toBase64Url } from "@/shared/bytes"

export const DEVICE_TRUST_MS = 30 * 24 * 60 * 60 * 1000
const PREFIX = "ck3:device:"
const LEGACY_CACHE_PREFIX = "credentials-keep:vault:"

export type DeviceRecord = {
  v: 1
  /** Secret Key, base64url. */
  sk: string
  /** Vault id and highest revision this device has seen. */
  vid: string
  rev: number
  /** Unix ms when trust (and this record) expires. */
  exp: number
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">

function storage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is DeviceRecord {
  if (!value || typeof value !== "object") return false
  const r = value as Partial<DeviceRecord>
  return (
    r.v === 1 &&
    typeof r.sk === "string" &&
    typeof r.vid === "string" &&
    Number.isSafeInteger(r.rev) &&
    Number.isSafeInteger(r.exp)
  )
}

export function loadDevice(vault: string, now = Date.now()): DeviceRecord | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PREFIX + vault)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.exp <= now) {
      store.removeItem(PREFIX + vault)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function deviceSecretKey(record: DeviceRecord | null): Uint8Array | null {
  if (!record) return null
  try {
    return fromBase64Url(record.sk, 16)
  } catch {
    return null
  }
}

export function saveDevice(
  vault: string,
  value: { secretKey: Uint8Array; vid: string; rev: number; exp: number }
): void {
  const record: DeviceRecord = {
    v: 1,
    sk: toBase64Url(value.secretKey),
    vid: value.vid,
    rev: value.rev,
    exp: value.exp,
  }
  try {
    storage()?.setItem(PREFIX + vault, JSON.stringify(record))
  } catch {
    // Storage full or blocked: the device simply stays untrusted.
  }
}

/** Raise the remembered revision (only on a device that is already trusted). */
export function updateHighWater(vault: string, vid: string, rev: number): void {
  const record = loadDevice(vault)
  if (!record || record.vid !== vid || rev <= record.rev) return
  saveDevice(vault, {
    secretKey: fromBase64Url(record.sk, 16),
    vid,
    rev,
    exp: record.exp,
  })
}

export function forgetDevice(vault: string): void {
  try {
    storage()?.removeItem(PREFIX + vault)
  } catch {
    // ignore
  }
}

/** Remove ciphertext caches left by the pre-CKV3 app (security audit F8). */
export function purgeLegacyCaches(): number {
  const store = storage()
  if (!store) return 0
  const doomed: string[] = []
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key?.startsWith(LEGACY_CACHE_PREFIX)) doomed.push(key)
    }
    for (const key of doomed) store.removeItem(key)
  } catch {
    return 0
  }
  return doomed.length
}
