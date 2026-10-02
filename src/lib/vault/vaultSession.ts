/**
 * Client-side vault session (CKV3): create, multi-step unlock, save with
 * conflict replay, re-key, export/import. Pure TypeScript (no React) so the
 * protocol tests can drive it against the real server handler.
 *
 * Memory: holds VK, the file DEK, the Secret Key and passkey key while
 * unlocked; never the master password, pwKey, authKey or server shares.
 * Security operations re-derive keys from a freshly typed password.
 */

import { ApiError, isApiError, type ApiClient } from "@/lib/api/client"
import { decryptFileJson } from "@/lib/crypto/file"
import { derivePasswordKeys, type Kdf, type PasswordKeys } from "@/lib/crypto/kdf"
import {
  formatKey,
  newKdfSalt,
  newRecoveryKey,
  newSecretKey,
  newShare,
  newVaultId,
  newVaultKey,
  recoveryAuthKey,
  SlotOpenError,
  unwrapPasskeyKey,
  wrapPasskeyKey,
} from "@/lib/crypto/keys"
import {
  buildSlots,
  openEmailSlot,
  openExportFile,
  openPrimarySlot,
  openRecoverySlot,
  openVaultBody,
  sealExportFile,
  sealVaultFile,
} from "@/lib/crypto/vaultFile"
import {
  DEVICE_TRUST_MS,
  deviceSecretKey,
  forgetDevice,
  loadDevice,
  saveDevice,
  updateHighWater,
} from "@/lib/device/deviceStore"
import { getNode, type JsonValue, type VaultArchive, type VaultKeysSection } from "@/lib/vault/fs"
import { checkRollback, describeRollback, type RollbackCheck } from "@/lib/vault/rollback"
import { archiveForSave, prepareEmptyVault, prepareSessionArchive } from "@/lib/vault/session"
import {
  archiveForExport,
  mergeImportIntoArchive,
  reencryptNode,
  reencryptTree,
} from "@/lib/vault/transfer"
import type {
  AccountRequest,
  AccountStatus,
  AccountSummary,
  RekeyRequest,
  UnlockResponse,
} from "@/shared/api"
import { fromBase64Url, toBase64Url, wipe } from "@/shared/bytes"
import {
  DEFAULT_KDF,
  parseCkv3,
  type Ckv3Header,
  type Ckv3Kdf,
  type Ckv3Parsed,
  type Ckv3Passkey,
  type Ckv3Slot,
} from "@/shared/ckv3"
import { normalizeVaultName } from "@/shared/vaultName"

export type SessionDeps = {
  api: ApiClient
  kdf?: Kdf
  now?: () => number
}

/** Evaluates WebAuthn PRF for one of the given credentials (see webauthn/prf). */
export type PasskeyProvider = {
  evaluate(
    credentials: { id: string; salt: string }[]
  ): Promise<{ id: string; output: Uint8Array }>
}

// --- Errors the UI reacts to ---------------------------------------------------

export class NeedSecretKeyError extends Error {
  readonly reason: "missing" | "wrong"
  constructor(reason: "missing" | "wrong") {
    super(
      reason === "missing"
        ? "Enter your Secret Key from your Emergency Kit."
        : "The Secret Key (or passkey) does not match this vault."
    )
    this.name = "NeedSecretKeyError"
    this.reason = reason
  }
}

export class NeedPasskeyError extends Error {
  constructor() {
    super("This vault requires your passkey or security key.")
    this.name = "NeedPasskeyError"
  }
}

export class RollbackError extends Error {
  readonly check: Exclude<RollbackCheck, { kind: "ok" }>
  constructor(check: Exclude<RollbackCheck, { kind: "ok" }>) {
    super(describeRollback(check))
    this.name = "RollbackError"
    this.check = check
  }
}

export class SessionStaleError extends Error {
  constructor() {
    super("This vault's keys changed on another device. Unlock it again.")
    this.name = "SessionStaleError"
  }
}

// --- Step 1: credentials → pending unlock ----------------------------------------

export type PendingUnlock =
  | { mode: "password"; vault: string; keys: PasswordKeys; kdf: Ckv3Kdf }
  | { mode: "recovery"; vault: string; recoveryKey: Uint8Array; rkAuth: Uint8Array }

export async function preparePasswordUnlock(
  deps: SessionDeps,
  vaultInput: string,
  password: string,
  onProgress?: (fraction: number) => void
): Promise<PendingUnlock> {
  const vault = normalizeVaultName(vaultInput)
  const { kdf } = await deps.api.prelogin(vault)
  const keys = await (deps.kdf ?? derivePasswordKeys)(password, kdf, onProgress)
  return { mode: "password", vault, keys, kdf }
}

export function prepareRecoveryUnlock(vaultInput: string, recoveryKey: Uint8Array): PendingUnlock {
  return {
    mode: "recovery",
    vault: normalizeVaultName(vaultInput),
    recoveryKey,
    rkAuth: recoveryAuthKey(recoveryKey),
  }
}

export function wipePending(pending: PendingUnlock | null): void {
  if (!pending) return
  if (pending.mode === "password") wipe(pending.keys.authKey, pending.keys.pwKey)
  else wipe(pending.recoveryKey, pending.rkAuth)
}

// --- Step 2: server unlock → downloaded blob --------------------------------------

export type UnlockOptions = {
  totp?: string
  emailToken?: string
  trustDevice: boolean
  deviceLabel?: string
}

export type DownloadedVault = {
  pending: PendingUnlock
  meta: UnlockResponse
  parsed: Ckv3Parsed
  trustDevice: boolean
}

/** Throws ApiError (second_factor_required, bad_credentials, locked, …). */
export async function requestUnlock(
  deps: SessionDeps,
  pending: PendingUnlock,
  options: UnlockOptions
): Promise<DownloadedVault> {
  const common = {
    vault: pending.vault,
    trustDevice: options.trustDevice,
    ...(options.deviceLabel ? { deviceLabel: options.deviceLabel } : {}),
  }
  const { meta, blob } = await deps.api.unlock(
    pending.mode === "password"
      ? {
          ...common,
          mode: "password",
          authKey: toBase64Url(pending.keys.authKey),
          ...(options.totp ? { totp: options.totp } : {}),
          ...(options.emailToken ? { emailToken: options.emailToken } : {}),
        }
      : { ...common, mode: "recovery", rkAuth: toBase64Url(pending.rkAuth) }
  )
  const parsed = parseCkv3(blob)
  if (parsed.header.purpose !== "vault") throw new Error("The server returned a non-vault file.")
  return { pending, meta, parsed, trustDevice: options.trustDevice }
}

// --- Step 3: open slots → VaultSession --------------------------------------------

export type OpenOptions = {
  /** Typed Secret Key (otherwise the trusted-device copy is used). */
  secretKey?: Uint8Array
  passkey?: PasskeyProvider
  /** Proceed even though a rollback was detected (user confirmed). */
  acceptRollback?: boolean
}

async function passkeyKeyFor(
  header: Ckv3Header,
  provider: PasskeyProvider | undefined
): Promise<Uint8Array> {
  if (!provider || !header.passkeys?.length) throw new NeedPasskeyError()
  const { id, output } = await provider.evaluate(
    header.passkeys.map((p) => ({ id: p.id, salt: p.salt }))
  )
  const entry = header.passkeys.find((p) => p.id === id)
  if (!entry) throw new NeedPasskeyError()
  try {
    return await unwrapPasskeyKey(header.vaultId, entry, output)
  } catch {
    throw new NeedSecretKeyError("wrong")
  } finally {
    wipe(output)
  }
}

export type OpenedVault = {
  session: VaultSession
  /** True after a Recovery Key unlock: the UI must force a re-key. */
  mustRekey: boolean
}

export async function openDownloadedVault(
  deps: SessionDeps,
  downloaded: DownloadedVault,
  options: OpenOptions = {}
): Promise<OpenedVault> {
  const { pending, meta, parsed } = downloaded
  const header = parsed.header
  const now = (deps.now ?? Date.now)()
  const device = loadDevice(pending.vault, now)

  const rollback = checkRollback(device, header)
  if (rollback.kind !== "ok" && !options.acceptRollback) throw new RollbackError(rollback)

  let vaultKey: Uint8Array
  let usedDeviceKey = false
  if (pending.mode === "recovery") {
    vaultKey = await openRecoverySlot(header, pending.recoveryKey)
  } else {
    const kp = header.requirePasskey ? await passkeyKeyFor(header, options.passkey) : undefined
    try {
      if (meta.emailShare) {
        vaultKey = await openEmailSlot(
          header,
          pending.keys.pwKey,
          fromBase64Url(meta.emailShare, 32),
          kp
        )
      } else {
        let secretKey = options.secretKey ?? null
        if (!secretKey) {
          secretKey = deviceSecretKey(device)
          usedDeviceKey = secretKey !== null
        }
        if (!secretKey) throw new NeedSecretKeyError("missing")
        try {
          vaultKey = await openPrimarySlot(
            header,
            pending.keys.pwKey,
            secretKey,
            fromBase64Url(meta.srvShare, 32),
            kp
          )
        } catch (error) {
          if (!(error instanceof SlotOpenError)) throw error
          // The server already verified the password, so this is the Secret
          // Key (or passkey). A stale device copy is dropped.
          if (usedDeviceKey) forgetDevice(pending.vault)
          throw new NeedSecretKeyError(usedDeviceKey ? "missing" : "wrong")
        }
      }
    } finally {
      if (kp) wipe(kp)
    }
  }

  const raw = await openVaultBody(parsed, vaultKey)
  const prepared = await prepareSessionArchive(raw)
  if (!prepared.keys) throw new Error("This vault file has no key section.")
  const secretKey = fromBase64Url(prepared.keys.sk, 16)

  // Device trust: remember the Secret Key and the revision we saw.
  if (downloaded.trustDevice || device) {
    const exp = meta.device.exp
      ? meta.device.exp * 1000
      : (device?.exp ?? now + DEVICE_TRUST_MS)
    saveDevice(pending.vault, { secretKey, vid: header.vaultId, rev: header.rev, exp })
  }

  const session = new VaultSession(deps, {
    name: pending.vault,
    session: meta.session,
    sessionExp: meta.sessionExp,
    etag: meta.etag,
    header,
    vaultKey,
    payload: prepared.payload,
    fileDekKey: prepared.fileDekKey,
    fileDekBytes: prepared.fileDekBytes,
    keys: prepared.keys,
    account: meta.account,
    device: meta.device,
  })
  return { session, mustRekey: pending.mode === "recovery" }
}

// --- Create --------------------------------------------------------------------

export type EmergencyKit = {
  vault: string
  secretKey: string
  recoveryKey?: string
}

export async function createVault(
  deps: SessionDeps,
  input: {
    vault: string
    password: string
    setupCode: string
    trustDevice: boolean
    onProgress?: (fraction: number) => void
  }
): Promise<{ session: VaultSession; kit: EmergencyKit }> {
  const vault = normalizeVaultName(input.vault)
  const kdf: Ckv3Kdf = { alg: "argon2id", v: 19, ...DEFAULT_KDF, salt: newKdfSalt() }
  const keys = await (deps.kdf ?? derivePasswordKeys)(input.password, kdf, input.onProgress)
  const vaultId = newVaultId()
  const vaultKey = newVaultKey()
  const secretKey = newSecretKey()
  const recoveryKey = newRecoveryKey()
  const srvShare = newShare()
  const prepared = await prepareEmptyVault()

  const header: Ckv3Header = {
    v: 1,
    purpose: "vault",
    vaultId,
    rev: 1,
    kdf,
    slots: await buildSlots({
      vaultId,
      vaultKey,
      pwKey: keys.pwKey,
      secretKey,
      srvShare,
      recovery: { key: recoveryKey },
    }),
  }
  const keysSection: VaultKeysSection = { sk: toBase64Url(secretKey) }
  const blob = await sealVaultFile(
    header,
    vaultKey,
    archiveForSave(prepared.payload, prepared.fileDekBytes, keysSection)
  )
  const created = await deps.api.create(
    {
      vault,
      setupCode: input.setupCode,
      authKey: toBase64Url(keys.authKey),
      rkAuth: toBase64Url(recoveryAuthKey(recoveryKey)),
      srvShare: toBase64Url(srvShare),
    },
    blob
  )
  const kit: EmergencyKit = {
    vault,
    secretKey: formatKey("SK1", secretKey),
    recoveryKey: formatKey("RK1", recoveryKey),
  }
  wipe(keys.authKey, keys.pwKey, recoveryKey, srvShare)

  if (input.trustDevice) {
    const now = (deps.now ?? Date.now)()
    saveDevice(vault, { secretKey, vid: vaultId, rev: 1, exp: now + DEVICE_TRUST_MS })
  }
  const session = new VaultSession(deps, {
    name: vault,
    session: created.session,
    sessionExp: created.sessionExp,
    etag: created.etag,
    header,
    vaultKey,
    payload: prepared.payload,
    fileDekKey: prepared.fileDekKey,
    fileDekBytes: prepared.fileDekBytes,
    keys: keysSection,
    account: { totp: false, email: null, emailUnlock: false },
    device: { trusted: false },
  })
  return { session, kit }
}

// --- Re-key options ----------------------------------------------------------------

export type RekeyProof = { password: string } | { recoveryKey: Uint8Array }

export type PasskeyEnrollment = {
  id: string
  salt: Uint8Array
  prfOutput: Uint8Array
  label: string
}

export type RekeyOptions = {
  proof: RekeyProof
  newPassword?: string
  newSecretKey?: boolean
  newRecoveryKey?: boolean
  /** Add or remove the email slot; default keeps the current state. */
  emailUnlock?: boolean
  requirePasskey?: boolean
  addPasskey?: PasskeyEnrollment
  removePasskeys?: string[]
  /** New VK and file DEK; implies a new Recovery Key. */
  rotateVaultKey?: boolean
  revokeDevices?: boolean
  onProgress?: (fraction: number) => void
}

export type RekeyResult = { kit: EmergencyKit | null }

type SessionState = {
  name: string
  session: string
  sessionExp: number
  etag: string
  header: Ckv3Header
  vaultKey: Uint8Array
  payload: VaultArchive
  fileDekKey: CryptoKey
  fileDekBytes: Uint8Array
  keys: VaultKeysSection
  account: AccountSummary
  device: { trusted: boolean; exp?: number }
}

export class VaultSession {
  readonly name: string
  private readonly deps: SessionDeps
  private state: SessionState
  private wiped = false

  constructor(deps: SessionDeps, state: SessionState) {
    this.deps = deps
    this.name = state.name
    this.state = state
  }

  get payload(): VaultArchive {
    return this.state.payload
  }
  get header(): Ckv3Header {
    return this.state.header
  }
  get account(): AccountSummary {
    return this.state.account
  }
  get device(): { trusted: boolean; exp?: number } {
    return this.state.device
  }
  get sessionExp(): number {
    return this.state.sessionExp
  }
  get passkeyLabels(): Record<string, { label: string; added: string }> {
    return this.state.keys.passkeys ?? {}
  }
  /** Secret Key in Emergency Kit format (it lives in the vault body). */
  get secretKeyText(): string {
    return formatKey("SK1", fromBase64Url(this.state.keys.sk, 16))
  }

  private ensureOpen(): void {
    if (this.wiped) throw new Error("Vault is locked.")
  }

  private get kdf(): Kdf {
    return this.deps.kdf ?? derivePasswordKeys
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  async decryptFile(path: string): Promise<JsonValue> {
    this.ensureOpen()
    const node = getNode(this.state.payload, path)
    if (!node || node.type !== "file") throw new Error(`Not a file: ${path}`)
    return decryptFileJson({ nonce: node.nonce, ciphertext: node.ciphertext }, this.state.fileDekKey)
  }

  /** The file DEK for encrypting new file bodies. */
  get fileDekKey(): CryptoKey {
    this.ensureOpen()
    return this.state.fileDekKey
  }

  private sealWith(header: Ckv3Header, payload: VaultArchive, keys = this.state.keys) {
    return sealVaultFile(
      header,
      this.state.vaultKey,
      archiveForSave(payload, this.state.fileDekBytes, keys)
    )
  }

  private afterWrite(header: Ckv3Header, etag: string): void {
    this.state.header = header
    this.state.etag = etag
    updateHighWater(this.name, header.vaultId, header.rev)
  }

  /**
   * Clone the payload, apply `mutate`, encrypt and upload. On a conflict
   * (saved elsewhere meanwhile) reload the latest version and replay once.
   */
  async save(mutate: (archive: VaultArchive) => void | Promise<void>): Promise<VaultArchive> {
    this.ensureOpen()
    for (let attempt = 1; ; attempt++) {
      const next = structuredClone(this.state.payload)
      await mutate(next)
      const header: Ckv3Header = { ...this.state.header, rev: this.state.header.rev + 1 }
      const blob = await this.sealWith(header, next)
      try {
        const result = await this.deps.api.putBlob(
          this.state.session,
          { ifMatch: this.state.etag },
          blob
        )
        this.state.payload = next
        this.afterWrite(header, result.etag)
        return next
      } catch (error) {
        if (!isApiError(error, "conflict") || attempt >= 2) throw error
        await this.reload()
      }
    }
  }

  /** Pull the latest server version (same VK) into this session. */
  async reload(): Promise<void> {
    this.ensureOpen()
    const { meta, blob } = await this.deps.api.getBlob(this.state.session)
    const parsed = parseCkv3(blob)
    if (parsed.header.vaultId !== this.state.header.vaultId) throw new SessionStaleError()
    let raw
    try {
      raw = await openVaultBody(parsed, this.state.vaultKey)
    } catch {
      throw new SessionStaleError()
    }
    const prepared = await prepareSessionArchive(raw)
    if (!prepared.keys) throw new SessionStaleError()
    wipe(this.state.fileDekBytes)
    this.state = {
      ...this.state,
      etag: meta.etag,
      header: parsed.header,
      payload: prepared.payload,
      fileDekKey: prepared.fileDekKey,
      fileDekBytes: prepared.fileDekBytes,
      keys: prepared.keys,
    }
    updateHighWater(this.name, parsed.header.vaultId, parsed.header.rev)
  }

  /** Re-derive password keys with the vault's current KDF (step-up). */
  async passwordKeys(password: string): Promise<PasswordKeys> {
    return this.kdf(password, this.state.header.kdf!)
  }

  /**
   * Change keys/factors. Always mints fresh server shares (P′, E′) so old
   * copies of the vault stop opening, and bumps the server auth epoch.
   */
  async rekey(options: RekeyOptions): Promise<RekeyResult> {
    this.ensureOpen()
    const s = this.state
    const header = s.header

    // Current credentials (proof) and the password key used for new slots.
    let proof: RekeyRequest["proof"]
    let pwKey: Uint8Array
    let currentKeys: PasswordKeys | null = null
    if ("password" in options.proof) {
      currentKeys = await this.kdf(options.proof.password, header.kdf!, options.onProgress)
      proof = { authKey: toBase64Url(currentKeys.authKey) }
      pwKey = currentKeys.pwKey
    } else {
      proof = { rkAuth: toBase64Url(recoveryAuthKey(options.proof.recoveryKey)) }
      if (!options.newPassword) throw new Error("Set a new master password to finish recovery.")
      pwKey = new Uint8Array(0)
    }

    let kdf = header.kdf!
    let newAuthKey: Uint8Array | undefined
    if (options.newPassword) {
      kdf = { ...kdf, ...DEFAULT_KDF, salt: newKdfSalt() }
      const next = await this.kdf(options.newPassword, kdf, options.onProgress)
      newAuthKey = next.authKey
      pwKey = next.pwKey
    }

    const rotate = options.rotateVaultKey === true
    const secretKey = options.newSecretKey ? newSecretKey() : fromBase64Url(s.keys.sk, 16)
    const recoveryKey = options.newRecoveryKey || rotate ? newRecoveryKey() : null
    const vaultKey = rotate ? newVaultKey() : s.vaultKey
    const srvShare = newShare()
    const wantEmail = options.emailUnlock ?? header.slots.some((slot) => slot.type === "email")
    const emailShare = wantEmail ? newShare() : null

    // Passkeys: one key KP, wrapped per credential; mixed into slots only
    // while "require passkey" is on.
    let passkeyKey = s.keys.kp ? fromBase64Url(s.keys.kp, 32) : null
    let passkeys: Ckv3Passkey[] = (header.passkeys ?? []).filter(
      (p) => !options.removePasskeys?.includes(p.id)
    )
    const labels = { ...(s.keys.passkeys ?? {}) }
    for (const id of options.removePasskeys ?? []) delete labels[id]
    if (options.addPasskey) {
      passkeyKey ??= newVaultKey()
      const add = options.addPasskey
      passkeys = [
        ...passkeys.filter((p) => p.id !== add.id),
        await wrapPasskeyKey(header.vaultId, add.id, add.salt, add.prfOutput, passkeyKey),
      ]
      labels[add.id] = { label: add.label, added: new Date().toISOString() }
    }
    const requirePasskey =
      (options.requirePasskey ?? header.requirePasskey === true) && passkeys.length > 0
    if (passkeys.length === 0) passkeyKey = null

    const existingRecovery = header.slots.find((slot) => slot.type === "recovery") as Ckv3Slot
    const slots = await buildSlots({
      vaultId: header.vaultId,
      vaultKey,
      pwKey,
      secretKey,
      srvShare,
      emailShare,
      passkeyKey: requirePasskey ? passkeyKey : null,
      recovery: recoveryKey ? { key: recoveryKey } : { slot: existingRecovery },
    })
    const nextHeader: Ckv3Header = {
      v: 1,
      purpose: "vault",
      vaultId: header.vaultId,
      rev: header.rev + 1,
      kdf,
      ...(requirePasskey ? { requirePasskey: true as const } : {}),
      slots,
      ...(passkeys.length > 0 ? { passkeys } : {}),
    }

    // Self-check: the new slots must open before anything is uploaded.
    const check = await openPrimarySlot(
      nextHeader,
      pwKey,
      secretKey,
      srvShare,
      requirePasskey ? passkeyKey! : undefined
    )
    const matches = (a: Uint8Array) => toBase64Url(a) === toBase64Url(vaultKey)
    if (!matches(check)) throw new Error("Internal error: new primary slot does not open.")
    if (emailShare) {
      const viaEmail = await openEmailSlot(
        nextHeader,
        pwKey,
        emailShare,
        requirePasskey ? passkeyKey! : undefined
      )
      if (!matches(viaEmail)) throw new Error("Internal error: new email slot does not open.")
    }
    if (recoveryKey && !matches(await openRecoverySlot(nextHeader, recoveryKey))) {
      throw new Error("Internal error: new recovery slot does not open.")
    }

    // Body: optionally a new file DEK (re-encrypt every file).
    let payload = s.payload
    let fileDekKey = s.fileDekKey
    let fileDekBytes = s.fileDekBytes
    if (rotate) {
      // KP is wrapped by the authenticators, not by VK, so it carries over.
      const fresh = await prepareEmptyVault()
      payload = structuredClone(s.payload)
      payload.root = await reencryptTree(payload.root, s.fileDekKey, fresh.fileDekKey)
      for (const entry of payload.recycleBin ?? []) {
        entry.node = await reencryptNode(entry.node, s.fileDekKey, fresh.fileDekKey)
      }
      fileDekKey = fresh.fileDekKey
      fileDekBytes = fresh.fileDekBytes
    }

    const keys: VaultKeysSection = {
      sk: toBase64Url(secretKey),
      ...(passkeyKey ? { kp: toBase64Url(passkeyKey) } : {}),
      ...(Object.keys(labels).length > 0 ? { passkeys: labels } : {}),
    }
    const blob = await sealVaultFile(
      nextHeader,
      vaultKey,
      archiveForSave(payload, fileDekBytes, keys)
    )
    const result = await this.deps.api.putBlob(
      s.session,
      {
        ifMatch: s.etag,
        rekey: {
          proof,
          ...(newAuthKey ? { newAuthKey: toBase64Url(newAuthKey) } : {}),
          ...(recoveryKey ? { newRkAuth: toBase64Url(recoveryAuthKey(recoveryKey)) } : {}),
          srvShare: toBase64Url(srvShare),
          emailShare: emailShare ? toBase64Url(emailShare) : null,
          ...(options.revokeDevices ? { revokeDevices: true } : {}),
        },
      },
      blob
    )

    const kit: EmergencyKit | null =
      options.newSecretKey || recoveryKey
        ? {
            vault: this.name,
            secretKey: formatKey("SK1", secretKey),
            ...(recoveryKey ? { recoveryKey: formatKey("RK1", recoveryKey) } : {}),
          }
        : null

    if (rotate) wipe(s.vaultKey, s.fileDekBytes)
    this.state = {
      ...s,
      session: result.session,
      sessionExp: result.sessionExp,
      etag: result.etag,
      header: nextHeader,
      vaultKey,
      payload,
      fileDekKey,
      fileDekBytes,
      keys,
      account: { ...s.account, emailUnlock: emailShare !== null },
    }
    const device = loadDevice(this.name)
    if (device) {
      saveDevice(this.name, { secretKey, vid: header.vaultId, rev: nextHeader.rev, exp: device.exp })
    }
    if (options.revokeDevices) this.state.device = { trusted: false }
    if (currentKeys) wipe(currentKeys.authKey, currentKeys.pwKey)
    wipe(pwKey, srvShare, emailShare, recoveryKey, newAuthKey)
    return { kit }
  }

  /** CKV3 export file that opens with this vault's Recovery Key. */
  async exportFile(): Promise<Uint8Array> {
    this.ensureOpen()
    const recoverySlot = this.state.header.slots.find((slot) => slot.type === "recovery")!
    return sealExportFile({
      vaultId: this.state.header.vaultId,
      vaultKey: this.state.vaultKey,
      recoverySlot,
      archive: archiveForExport(this.state.payload, this.state.fileDekBytes),
    })
  }

  /**
   * Merge an export/import file. Files exported from this same vault open
   * with the session key; others need their Recovery Key (or import key).
   */
  async importFile(
    blob: Uint8Array,
    recoveryKey: Uint8Array | null,
    options: { intoRoot?: boolean } = {}
  ): Promise<{ folderPath: string; files: number }> {
    this.ensureOpen()
    const parsed = parseCkv3(blob)
    const sameVault = parsed.header.vaultId === this.state.header.vaultId
    if (!recoveryKey && !sameVault) {
      throw new Error("This file comes from another vault. Enter that vault's Recovery Key or import key.")
    }
    const raw = await openExportFile(
      blob,
      recoveryKey ? { recoveryKey } : { vaultKey: this.state.vaultKey }
    )
    let result = { folderPath: "", files: 0 }
    await this.save(async (archive) => {
      result = await mergeImportIntoArchive(archive, this.state.fileDekKey, raw, options)
    })
    return result
  }

  async accountRequest<T = AccountStatus>(request: AccountRequest): Promise<T> {
    this.ensureOpen()
    return this.deps.api.account<T>(this.state.session, request)
  }

  /**
   * Step-up proof for /account operations from a freshly typed password.
   * Not checked here: the server verifies it with the operation.
   */
  async passwordProof(password: string): Promise<{ authKey: string }> {
    const keys = await this.passwordKeys(password)
    const proof = { authKey: toBase64Url(keys.authKey) }
    wipe(keys.authKey, keys.pwKey)
    return proof
  }

  /** Have the server check the master password (counts toward the lockout). */
  async verifyPassword(password: string): Promise<void> {
    const proof = await this.passwordProof(password)
    await this.accountRequest<{ ok: true }>({ op: "verify", proof })
  }

  setDevice(device: { trusted: boolean; exp?: number }): void {
    this.state.device = device
  }

  /**
   * Adopt the server's view after an /account call. With `rememberSecretKey`
   * (the user just asked to trust this browser) a trusted browser also keeps
   * the Secret Key, as an unlock with "Trust this device" would.
   */
  applyAccountStatus(status: AccountStatus, options: { rememberSecretKey?: boolean } = {}): void {
    this.state.account = { totp: status.totp, email: status.email, emailUnlock: status.emailUnlock }
    const here = status.devices.find((device) => device.current)
    this.state.device = here ? { trusted: true, exp: here.exp } : { trusted: false }
    if (here && options.rememberSecretKey && !loadDevice(this.name, this.now())) {
      saveDevice(this.name, {
        secretKey: fromBase64Url(this.state.keys.sk, 16),
        vid: this.state.header.vaultId,
        rev: this.state.header.rev,
        exp: here.exp * 1000,
      })
    }
  }

  /** Drop key material (best effort; JS cannot guarantee erasure). */
  wipe(): void {
    if (this.wiped) return
    this.wiped = true
    wipe(this.state.vaultKey, this.state.fileDekBytes)
  }
}

/** Step-up proof from the Recovery Key (e.g. turning off TOTP after losing the phone). */
export function recoveryProof(recoveryKey: Uint8Array): { rkAuth: string } {
  return { rkAuth: toBase64Url(recoveryAuthKey(recoveryKey)) }
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof SessionStaleError || isApiError(error, "session_expired")
}

export { ApiError }
