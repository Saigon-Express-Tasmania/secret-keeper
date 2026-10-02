/**
 * KeePass (.kdbx) → vault archive mapping for `ck-file from-kdbx`.
 * Entries become KeePass-style account files (encrypted under a file DEK);
 * the KeePass recycle bin becomes the vault Recycle Bin. Prints titles and
 * counts only — never secrets.
 */

import { argon2d, argon2id } from "@noble/hashes/argon2.js"
import * as kdbxweb from "kdbxweb"
import type { KdbxBinary, KdbxBinaryWithHash, KdbxEntry, KdbxGroup } from "kdbxweb"

import {
  createEmptyAccount,
  createEmptyOtp,
  serializeAccount,
  type AccountEntry,
  type OtpAlgorithm,
  type OtpDigits,
  type OtpSettings,
} from "@/lib/account/schema"
import { bytesToBase64, encryptFileJson } from "@/lib/crypto/file"
import { parseOtpauthUri } from "@/lib/otp/otpauth"
import {
  createEmptyArchive,
  getNode,
  joinPath,
  mkdir,
  putFile,
  uniqueSiblingPath,
  type FsDir,
  type FsFile,
  type FsNode,
  type JsonValue,
  type RecycleBinEntry,
  type VaultArchive,
} from "@/lib/vault/fs"

const MAX_ATTACHMENT_BYTES = 512 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 2 * 1024 * 1024

const STANDARD_FIELDS = new Set(["Title", "UserName", "Password", "URL", "Notes"])
const OTP_FIELDS = new Set([
  "otp",
  "TOTP Seed",
  "TOTP Settings",
  "TimeOtp-Secret",
  "TimeOtp-Secret-Base32",
  "TimeOtp-Secret-Hex",
  "TimeOtp-Algorithm",
  "TimeOtp-Length",
  "TimeOtp-Period",
  "HmacOtp-Secret",
  "HmacOtp-Secret-Base32",
  "HmacOtp-Secret-Hex",
  "HmacOtp-Counter",
])

export type Stats = {
  groups: number
  entries: number
  recycledEntries: number
  recycledGroups: number
  otp: number
  attachmentsKept: number
  attachmentsSkipped: number
  customFieldNames: Set<string>
}

export function installArgon2(): void {
  kdbxweb.CryptoEngine.setArgon2Impl(
    async (password, salt, memory, iterations, length, parallelism, type, version) => {
      const opts = {
        t: iterations,
        m: memory,
        p: parallelism,
        dkLen: length,
        version,
        maxmem: Math.max(memory * 1024 * 2, 2 * 1024 * 1024 * 1024),
      }
      // kdbxweb passes 0 = Argon2d, 2 = Argon2id.
      const fn = type === 0 ? argon2d : argon2id
      const hash = fn(new Uint8Array(password), new Uint8Array(salt), opts)
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength)
    }
  )
}

function fieldText(entry: KdbxEntry, key: string): string {
  const raw = entry.fields.get(key)
  if (raw == null) return ""
  if (typeof raw === "string") return raw
  return raw.getText()
}

function toIso(date: Date | undefined): string {
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString()
  return new Date().toISOString()
}

function uuidToString(uuid: kdbxweb.KdbxUuid): string {
  try {
    const bytes = new Uint8Array(uuid.toBytes())
    if (bytes.length === 16) {
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
  } catch {
    /* fall through */
  }
  return crypto.randomUUID()
}

function sanitizeSegment(raw: string): string {
  // eslint-disable-next-line no-control-regex -- strip control characters from names
  let name = raw.replace(/[/\\]/g, "-").replace(/[\u0000-\u001f]/g, "").trim()
  name = name.replace(/[. ]+$/g, "")
  if (!name || name === "." || name === "..") return "untitled"
  return name
}

function fileNameFor(title: string): string {
  const stem = sanitizeSegment(title || "untitled").slice(0, 120)
  return `${stem}.json`
}

function parseOtpAlg(raw: string): OtpAlgorithm {
  const s = raw.toUpperCase().replace(/-/g, "")
  if (s === "SHA256") return "SHA256"
  if (s === "SHA512") return "SHA512"
  return "SHA1"
}

function parseOtpDigits(raw: string): OtpDigits {
  if (raw === "7") return 7
  if (raw === "8") return 8
  return 6
}

function mapOtp(entry: KdbxEntry, title: string): OtpSettings | null {
  const otpField = fieldText(entry, "otp").trim()
  if (otpField) {
    const parsed = parseOtpauthUri(otpField)
    if (parsed) return parsed
    if (/^[A-Z2-7=\s]+$/i.test(otpField) && otpField.replace(/\s/g, "").length >= 8) {
      return { ...createEmptyOtp("totp"), secret: otpField, label: title }
    }
  }

  const totpSecret =
    fieldText(entry, "TimeOtp-Secret-Base32") ||
    fieldText(entry, "TOTP Seed") ||
    fieldText(entry, "TimeOtp-Secret")
  if (totpSecret) {
    let period = 30
    let digits: OtpDigits = 6
    const settings = fieldText(entry, "TOTP Settings")
    if (settings) {
      const parts = settings.split(";")
      const p = Number.parseInt(parts[0] ?? "", 10)
      if (Number.isFinite(p) && p > 0) period = p
      digits = parseOtpDigits(parts[1] ?? "")
    }
    const periodRaw = fieldText(entry, "TimeOtp-Period")
    if (periodRaw) {
      const p = Number.parseInt(periodRaw, 10)
      if (Number.isFinite(p) && p > 0) period = p
    }
    return {
      ...createEmptyOtp("totp"),
      secret: totpSecret,
      algorithm: parseOtpAlg(fieldText(entry, "TimeOtp-Algorithm")),
      digits: parseOtpDigits(fieldText(entry, "TimeOtp-Length") || String(digits)),
      period,
      issuer: "",
      label: title,
    }
  }

  const hotpSecret =
    fieldText(entry, "HmacOtp-Secret-Base32") || fieldText(entry, "HmacOtp-Secret")
  if (hotpSecret) {
    const counterRaw = Number.parseInt(fieldText(entry, "HmacOtp-Counter") || "0", 10)
    return {
      ...createEmptyOtp("hotp"),
      secret: hotpSecret,
      counter: Number.isFinite(counterRaw) && counterRaw >= 0 ? counterRaw : 0,
      label: title,
    }
  }

  return null
}

function binaryBytes(bin: KdbxBinary | KdbxBinaryWithHash): Uint8Array {
  const value: KdbxBinary = kdbxweb.KdbxBinaries.isKdbxBinaryWithHash(bin)
    ? bin.value
    : bin
  if (value instanceof kdbxweb.ProtectedValue) return value.getBinary()
  return new Uint8Array(value)
}

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "png") return "image/png"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "gif") return "image/gif"
  if (ext === "webp") return "image/webp"
  if (ext === "pdf") return "application/pdf"
  if (ext === "txt") return "text/plain"
  if (ext === "json") return "application/json"
  return "application/octet-stream"
}

function mapEntry(
  entry: KdbxEntry,
  stats: Stats,
  attachmentBudget: { used: number }
): AccountEntry {
  const title = fieldText(entry, "Title") || "untitled"
  const account = createEmptyAccount({ title })
  account.id = uuidToString(entry.uuid)
  account.username = fieldText(entry, "UserName")
  account.password = fieldText(entry, "Password")
  account.url = fieldText(entry, "URL")
  account.notes = fieldText(entry, "Notes")
  account.createdAt = toIso(entry.times.creationTime)
  account.updatedAt = toIso(entry.times.lastModTime)
  account.otp = mapOtp(entry, title)
  if (account.otp) stats.otp += 1

  const extra: Record<string, JsonValue> = {}
  if (entry.tags.length > 0) extra.tags = [...entry.tags]

  for (const [key, raw] of entry.fields) {
    if (STANDARD_FIELDS.has(key) || OTP_FIELDS.has(key)) continue
    const value = typeof raw === "string" ? raw : raw.getText()
    if (!value) continue
    stats.customFieldNames.add(key)
    if (!account.recoveryEmail && /e-?mail|recovery.?mail/i.test(key)) {
      account.recoveryEmail = value
      continue
    }
    extra[key] = value
  }

  const attachments: JsonValue[] = []
  const skipped: JsonValue[] = []
  for (const [name, bin] of entry.binaries) {
    const bytes = binaryBytes(bin)
    if (
      bytes.byteLength > MAX_ATTACHMENT_BYTES ||
      attachmentBudget.used + bytes.byteLength > MAX_TOTAL_ATTACHMENT_BYTES
    ) {
      skipped.push({ name, size: bytes.byteLength })
      stats.attachmentsSkipped += 1
      continue
    }
    attachmentBudget.used += bytes.byteLength
    attachments.push({
      name,
      mime: guessMime(name),
      size: bytes.byteLength,
      base64: bytesToBase64(bytes),
    })
    stats.attachmentsKept += 1
  }
  if (attachments.length > 0) extra.attachments = attachments
  if (skipped.length > 0) extra.skippedAttachments = skipped

  if (Object.keys(extra).length > 0) account.extra = extra
  return account
}

function accountJson(account: AccountEntry): JsonValue {
  const json = serializeAccount(account)
  if (json && typeof json === "object" && !Array.isArray(json)) {
    json.createdAt = account.createdAt
    json.updatedAt = account.updatedAt
  }
  return json
}

function stamp(node: FsNode, created: Date | undefined, modified: Date | undefined): void {
  node.createdAt = toIso(created)
  node.modifiedAt = toIso(modified ?? created)
}

async function encryptAccountFile(
  entry: KdbxEntry,
  key: CryptoKey,
  stats: Stats,
  budget: { used: number }
): Promise<FsFile> {
  const account = mapEntry(entry, stats, budget)
  const enc = await encryptFileJson(accountJson(account), key)
  const file: FsFile = {
    type: "file",
    nonce: enc.nonce,
    ciphertext: enc.ciphertext,
  }
  stamp(file, entry.times.creationTime, entry.times.lastModTime)
  return file
}

export function printTree(
  group: KdbxGroup,
  indent: string,
  recycleBinUuid: kdbxweb.KdbxUuid | undefined,
  stats: Stats,
  inRecycle: boolean
): void {
  const isRb = Boolean(recycleBinUuid && group.uuid.equals(recycleBinUuid))
  const recycled = inRecycle || isRb
  stats.groups += 1
  const mark = isRb ? " [recycle-bin]" : ""
  console.log(
    `${indent}${group.name || "(unnamed)"}${mark}  (${group.entries.length} entries, ${group.groups.length} groups)`
  )
  for (const entry of group.entries) {
    stats.entries += 1
    if (recycled) stats.recycledEntries += 1
    const title = fieldText(entry, "Title") || "(untitled)"
    const otp = Boolean(
      fieldText(entry, "otp") ||
        fieldText(entry, "TimeOtp-Secret-Base32") ||
        fieldText(entry, "TOTP Seed") ||
        fieldText(entry, "HmacOtp-Secret-Base32")
    )
    const att = entry.binaries.size
    const flags = [otp ? "otp" : "", att ? `${att} att` : ""].filter(Boolean)
    console.log(`${indent}  - ${title}${flags.length ? ` [${flags.join(", ")}]` : ""}`)
  }
  for (const child of group.groups) {
    if (recycleBinUuid && child.uuid.equals(recycleBinUuid)) stats.recycledGroups += 1
    printTree(child, `${indent}  `, recycleBinUuid, stats, recycled || isRb)
  }
}

async function putAccountAt(
  archive: VaultArchive,
  dirPath: string,
  entry: KdbxEntry,
  key: CryptoKey,
  stats: Stats,
  budget: { used: number }
): Promise<string> {
  const name = fileNameFor(fieldText(entry, "Title"))
  const dest = uniqueSiblingPath(archive, dirPath, name, "imported")
  const file = await encryptAccountFile(entry, key, stats, budget)
  putFile(archive, dest, file)
  const node = getNode(archive, dest)
  if (node) stamp(node, entry.times.creationTime, entry.times.lastModTime)
  return dest
}

export async function importGroup(
  archive: VaultArchive,
  group: KdbxGroup,
  destPath: string,
  key: CryptoKey,
  recycleBinUuid: kdbxweb.KdbxUuid | undefined,
  stats: Stats,
  budget: { used: number }
): Promise<void> {
  if (destPath) {
    mkdir(archive, destPath)
    const node = getNode(archive, destPath)
    if (node) stamp(node, group.times.creationTime, group.times.lastModTime)
  }

  for (const entry of group.entries) {
    await putAccountAt(archive, destPath, entry, key, stats, budget)
  }

  const usedNames = new Set<string>()
  for (const child of group.groups) {
    if (recycleBinUuid && child.uuid.equals(recycleBinUuid)) continue
    let childName = sanitizeSegment(child.name || "untitled")
    while (usedNames.has(childName)) childName = `${childName}-2`
    usedNames.add(childName)
    const childPath = joinPath(destPath, childName)
    const existing = getNode(archive, childPath)
    const dest =
      existing && existing.type === "file"
        ? uniqueSiblingPath(archive, destPath, childName, "imported")
        : childPath
    await importGroup(archive, child, dest, key, recycleBinUuid, stats, budget)
  }
}

async function groupToDir(
  group: KdbxGroup,
  key: CryptoKey,
  stats: Stats,
  budget: { used: number }
): Promise<FsDir> {
  const dir: FsDir = { type: "dir", entries: {} }
  stamp(dir, group.times.creationTime, group.times.lastModTime)

  for (const entry of group.entries) {
    const name = fileNameFor(fieldText(entry, "Title"))
    let fileName = name
    let n = 2
    while (fileName in dir.entries) {
      const stem = name.replace(/\.json$/i, "")
      fileName = `${stem} (imported ${n}).json`
      n += 1
    }
    dir.entries[fileName] = await encryptAccountFile(entry, key, stats, budget)
  }

  const used = new Set<string>()
  for (const child of group.groups) {
    let childName = sanitizeSegment(child.name || "untitled")
    while (used.has(childName) || childName in dir.entries) {
      childName = `${childName}-2`
    }
    used.add(childName)
    dir.entries[childName] = await groupToDir(child, key, stats, budget)
  }
  return dir
}

export async function importRecycleBin(
  archive: VaultArchive,
  bin: KdbxGroup,
  key: CryptoKey,
  stats: Stats,
  budget: { used: number }
): Promise<void> {
  const recycleBin: RecycleBinEntry[] = archive.recycleBin ?? []
  for (const entry of bin.entries) {
    const originalPath = fileNameFor(fieldText(entry, "Title"))
    recycleBin.push({
      id: uuidToString(entry.uuid),
      originalPath,
      deletedAt: toIso(entry.times.lastModTime),
      node: await encryptAccountFile(entry, key, stats, budget),
    })
  }
  for (const child of bin.groups) {
    recycleBin.push({
      id: uuidToString(child.uuid),
      originalPath: sanitizeSegment(child.name || "untitled"),
      deletedAt: toIso(child.times.lastModTime),
      node: await groupToDir(child, key, stats, budget),
    })
  }
  archive.recycleBin = recycleBin
}

export function emptyStats(): Stats {
  return {
    groups: 0,
    entries: 0,
    recycledEntries: 0,
    recycledGroups: 0,
    otp: 0,
    attachmentsKept: 0,
    attachmentsSkipped: 0,
    customFieldNames: new Set(),
  }
}

/** Open a KeePass database with its master password. */
export async function loadKdbx(data: Uint8Array, password: string): Promise<kdbxweb.Kdbx> {
  installArgon2()
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password))
  try {
    return await kdbxweb.Kdbx.load(copy, credentials)
  } catch (err) {
    const code = err instanceof kdbxweb.KdbxError ? err.code : ""
    if (code === kdbxweb.Consts.ErrorCodes.InvalidKey) {
      throw new Error("Invalid KeePass master password (or the database needs a key file).")
    }
    throw err
  }
}

/** Map a KeePass database into an archive whose files are encrypted under `fileDekKey`. */
export async function buildArchiveFromKdbx(
  db: kdbxweb.Kdbx,
  fileDekKey: CryptoKey
): Promise<{ archive: VaultArchive; stats: Stats }> {
  const archive = createEmptyArchive()
  const stats = emptyStats()
  const budget = { used: 0 }
  const recycleBinUuid = db.meta.recycleBinUuid
  await importGroup(archive, db.getDefaultGroup(), "", fileDekKey, recycleBinUuid, stats, budget)
  if (recycleBinUuid) {
    const bin = db.getGroup(recycleBinUuid)
    if (bin) await importRecycleBin(archive, bin, fileDekKey, stats, budget)
  }
  archive.updatedAt = new Date().toISOString()
  return { archive, stats }
}
