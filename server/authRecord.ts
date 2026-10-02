/**
 * Auth record = custom metadata on the vault object itself, so it is written
 * atomically with the blob (a password change swaps slots and verifier in
 * one PUT, and backups made by CopyObject carry their matching record).
 */

import { fromBase64Url, fromUtf8, toBase64Url, utf8 } from "../src/shared/bytes"
import { validateKdf, type Ckv3Kdf } from "../src/shared/ckv3"
import type { ObjectMeta } from "./store"

export type AuthRecord = {
  /** Vault id (matches the CKV3 header). */
  vid: string
  /** Current revision (matches the CKV3 header). */
  rev: number
  /** KDF params handed out by prelogin. */
  kdf: Ckv3Kdf
  /** Slot-structure hash of the current header. */
  sh: string
  /** Password verifier. */
  av: string
  /** Recovery Key verifier. */
  rv: string
  /** Sealed primary-slot share P. */
  sp: string
  /** Sealed email-slot share E (only when the vault has an email slot). */
  se?: string
  /** Auth epoch; bumped by every re-key (invalidates sessions). */
  ae: number
  /** Last backup, unix seconds (0 = never). */
  bk: number
  /** Last prune, unix seconds (0 = never). */
  pr: number
}

export function encodeAuthRecord(record: AuthRecord): ObjectMeta {
  const meta: ObjectMeta = {
    ck: "3",
    vid: record.vid,
    rev: String(record.rev),
    kdf: toBase64Url(utf8(JSON.stringify(record.kdf))),
    sh: record.sh,
    av: record.av,
    rv: record.rv,
    sp: record.sp,
    ae: String(record.ae),
    bk: String(record.bk),
    pr: String(record.pr),
  }
  if (record.se) meta.se = record.se
  return meta
}

function int(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,15}$/.test(value)) return null
  return Number(value)
}

/** Null when the object is not a CKV3 vault managed by this server. */
export function decodeAuthRecord(meta: ObjectMeta): AuthRecord | null {
  if (meta.ck !== "3") return null
  const rev = int(meta.rev)
  const ae = int(meta.ae)
  const bk = int(meta.bk)
  const pr = int(meta.pr)
  if (
    rev === null || ae === null || bk === null || pr === null ||
    !meta.vid || !meta.kdf || !meta.sh || !meta.av || !meta.rv || !meta.sp
  ) {
    return null
  }
  let kdf: Ckv3Kdf
  try {
    kdf = validateKdf(JSON.parse(fromUtf8(fromBase64Url(meta.kdf))))
  } catch {
    return null
  }
  return {
    vid: meta.vid,
    rev,
    kdf,
    sh: meta.sh,
    av: meta.av,
    rv: meta.rv,
    sp: meta.sp,
    ...(meta.se ? { se: meta.se } : {}),
    ae,
    bk,
    pr,
  }
}
