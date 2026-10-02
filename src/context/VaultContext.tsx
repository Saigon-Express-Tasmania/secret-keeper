import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { encryptFileJson } from "@/lib/crypto/file"
import { parseKey } from "@/lib/crypto/keys"
import { forgetDevice as forgetLocalDevice } from "@/lib/device/deviceStore"
import { readAutoLockMinutes } from "@/lib/prefs/autoLock"
import { clearSecretClipboard } from "@/lib/security/clipboard"
import { watchIdle } from "@/lib/security/idleLock"
import { sessionDeps } from "@/lib/vault/deps"
import type { JsonValue, VaultArchive } from "@/lib/vault/fs"
import { putFile } from "@/lib/vault/fs"
import {
  isSessionExpired,
  type RekeyOptions,
  type RekeyResult,
  type VaultSession,
} from "@/lib/vault/vaultSession"
import type { AccountRequest, AccountStatus, AccountSummary } from "@/shared/api"

export type LockReason = "manual" | "idle" | "pagehide" | "expired"

/** Non-secret facts about the unlocked vault for the UI. */
export type VaultInfo = {
  name: string
  account: AccountSummary
  device: { trusted: boolean; exp?: number }
  rev: number
  requirePasskey: boolean
  passkeys: { id: string; label: string; added: string }[]
  hasEmailSlot: boolean
}

type VaultContextValue = {
  unlocked: boolean
  payload: VaultArchive | null
  vault: VaultInfo | null
  /** Why the vault was last locked (shown on the Gate); null before first unlock. */
  lockReason: LockReason | null
  saving: boolean
  saveError: string | null
  /** Hand a freshly unlocked/created session to the app. */
  attach: (session: VaultSession) => void
  lock: (reason?: LockReason) => void
  /** Decrypt one file for viewing — result is not stored in context. */
  decryptFile: (path: string) => Promise<JsonValue>
  /**
   * Clone payload, run mutator, encrypt+upload (replays once on conflict).
   * On failure keeps the previous payload.
   */
  commit: (mutator: (archive: VaultArchive) => void | Promise<void>) => Promise<void>
  /** Encrypt JSON and write as a new/updated encrypted file, then save. */
  putEncryptedFile: (path: string, json: JsonValue, options?: { icon?: string }) => Promise<void>
  /** Change keys/factors (password, Secret Key, Recovery Key, email slot, passkeys). */
  rekey: (options: RekeyOptions) => Promise<RekeyResult>
  /** CKV3 export file (opens with this vault's Recovery Key). */
  exportVault: () => Promise<Uint8Array>
  /** Merge an export/import file; returns the folder that received it. */
  importVault: (
    blob: Uint8Array,
    recoveryKeyText: string | null,
    options?: { intoRoot?: boolean }
  ) => Promise<string>
  /** /account operation (other than "verify"); the returned status is applied. */
  accountRequest: (request: Exclude<AccountRequest, { op: "verify" }>) => Promise<AccountStatus>
  /** Step-up: authKey proof from a freshly typed password; the server checks it with the operation. */
  passwordProof: (password: string) => Promise<{ authKey: string }>
  /** Have the server check the master password now. */
  verifyPassword: (password: string) => Promise<void>
  /** Emergency Kit Secret Key (shown after step-up). */
  secretKeyText: () => string
  /** Stop trusting this browser for the current vault (local + server). */
  forgetThisDevice: () => Promise<void>
}

const VaultContext = createContext<VaultContextValue | null>(null)

function infoFrom(session: VaultSession): VaultInfo {
  const labels = session.passkeyLabels
  return {
    name: session.name,
    account: session.account,
    device: session.device,
    rev: session.header.rev,
    requirePasskey: session.header.requirePasskey === true,
    passkeys: (session.header.passkeys ?? []).map((p) => ({
      id: p.id,
      label: labels[p.id]?.label ?? "Passkey",
      added: labels[p.id]?.added ?? "",
    })),
    hasEmailSlot: session.header.slots.some((slot) => slot.type === "email"),
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<VaultArchive | null>(null)
  const [vault, setVault] = useState<VaultInfo | null>(null)
  const [lockReason, setLockReason] = useState<LockReason | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // The session (and every key it holds) stays out of React state.
  const sessionRef = useRef<VaultSession | null>(null)

  const sync = useCallback((session: VaultSession) => {
    setPayload(session.payload)
    setVault(infoFrom(session))
  }, [])

  const attach = useCallback(
    (session: VaultSession) => {
      sessionRef.current?.wipe()
      sessionRef.current = session
      sync(session)
      setLockReason(null)
      setSaveError(null)
    },
    [sync]
  )

  const lock = useCallback((reason: LockReason = "manual") => {
    sessionRef.current?.wipe()
    sessionRef.current = null
    clearSecretClipboard()
    setPayload(null)
    setVault(null)
    setLockReason(reason)
    setSaveError(null)
    setSaving(false)
  }, [])

  const unlocked = payload !== null
  useEffect(() => {
    if (!unlocked) return
    return watchIdle({
      idleMs: readAutoLockMinutes() * 60_000,
      onIdle: () => lock("idle"),
      onPageHide: () => lock("pagehide"),
    })
  }, [unlocked, lock])

  const requireSession = useCallback((): VaultSession => {
    const session = sessionRef.current
    if (!session) throw new Error("Vault is locked.")
    return session
  }, [])

  /** Run a session operation; an ended session locks the app. */
  const guarded = useCallback(
    async <T,>(operation: (session: VaultSession) => Promise<T>): Promise<T> => {
      const session = requireSession()
      try {
        return await operation(session)
      } catch (error) {
        if (isSessionExpired(error)) lock("expired")
        throw error
      }
    },
    [requireSession, lock]
  )

  const decryptFile = useCallback(
    (path: string) => requireSession().decryptFile(path),
    [requireSession]
  )

  const commit = useCallback(
    async (mutator: (archive: VaultArchive) => void | Promise<void>) => {
      setSaving(true)
      setSaveError(null)
      try {
        await guarded(async (session) => {
          await session.save(mutator)
          sync(session)
        })
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Failed to save vault.")
        throw error
      } finally {
        setSaving(false)
      }
    },
    [guarded, sync]
  )

  const putEncryptedFile = useCallback(
    async (path: string, json: JsonValue, options?: { icon?: string }) => {
      const key = requireSession().fileDekKey
      await commit(async (archive) => {
        const enc = await encryptFileJson(json, key)
        putFile(archive, path, { ...enc, icon: options?.icon })
      })
    },
    [commit, requireSession]
  )

  const rekey = useCallback(
    async (options: RekeyOptions) => {
      setSaving(true)
      setSaveError(null)
      try {
        return await guarded(async (session) => {
          const result = await session.rekey(options)
          sync(session)
          return result
        })
      } finally {
        setSaving(false)
      }
    },
    [guarded, sync]
  )

  const exportVault = useCallback(() => guarded((session) => session.exportFile()), [guarded])

  const importVault = useCallback(
    async (blob: Uint8Array, recoveryKeyText: string | null, options?: { intoRoot?: boolean }) => {
      const recoveryKey = recoveryKeyText?.trim() ? parseKey("RK1", recoveryKeyText) : null
      setSaving(true)
      setSaveError(null)
      try {
        return await guarded(async (session) => {
          const result = await session.importFile(blob, recoveryKey, options)
          sync(session)
          return result.folderPath
        })
      } finally {
        setSaving(false)
      }
    },
    [guarded, sync]
  )

  const accountRequest = useCallback(
    (request: Exclude<AccountRequest, { op: "verify" }>) =>
      guarded(async (session) => {
        const status = await session.accountRequest<AccountStatus>(request)
        session.applyAccountStatus(status, {
          rememberSecretKey: request.op === "totp.enable" && request.trustDevice === true,
        })
        sync(session)
        return status
      }),
    [guarded, sync]
  )

  const passwordProof = useCallback(
    (password: string) => guarded((session) => session.passwordProof(password)),
    [guarded]
  )

  const verifyPassword = useCallback(
    (password: string) => guarded((session) => session.verifyPassword(password)),
    [guarded]
  )

  const secretKeyText = useCallback(() => requireSession().secretKeyText, [requireSession])

  const forgetThisDevice = useCallback(async () => {
    const session = requireSession()
    forgetLocalDevice(session.name)
    await sessionDeps.api.forgetDevice(session.name).catch(() => {})
    session.setDevice({ trusted: false })
    sync(session)
  }, [requireSession, sync])

  const value = useMemo(
    () => ({
      unlocked,
      payload,
      vault,
      lockReason,
      saving,
      saveError,
      attach,
      lock,
      decryptFile,
      commit,
      putEncryptedFile,
      rekey,
      exportVault,
      importVault,
      accountRequest,
      passwordProof,
      verifyPassword,
      secretKeyText,
      forgetThisDevice,
    }),
    [
      unlocked,
      payload,
      vault,
      lockReason,
      saving,
      saveError,
      attach,
      lock,
      decryptFile,
      commit,
      putEncryptedFile,
      rekey,
      exportVault,
      importVault,
      accountRequest,
      passwordProof,
      verifyPassword,
      secretKeyText,
      forgetThisDevice,
    ]
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) {
    throw new Error("useVault must be used within a VaultProvider")
  }
  return ctx
}
