import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { decryptFileJson, encryptFileJson } from "@/lib/crypto/file"
import type { EncryptedVaultBlob } from "@/lib/crypto/vault"
import { toVaultObjectKey } from "@/lib/storage"
import type { JsonValue, VaultArchive } from "@/lib/vault/fs"
import { getNode, putFile } from "@/lib/vault/fs"
import { saveVault, unlockVault } from "@/lib/vault/persist"
import {
  buildExportBlob,
  mergeImportIntoArchive,
} from "@/lib/vault/transfer"

type VaultContextValue = {
  unlocked: boolean
  payload: VaultArchive | null
  /** Display name of the unlocked vault (object key without `.enc`). */
  vaultName: string | null
  /** In-memory only; cleared on lock. */
  masterPassword: string | null
  saving: boolean
  saveError: string | null
  unlock: (masterPassword: string, vaultName: string) => Promise<void>
  lock: () => void
  /** Decrypt one file for viewing — result is not stored in context. */
  decryptFile: (path: string) => Promise<JsonValue>
  /**
   * Clone payload, run mutator, encrypt+upload. On failure keeps previous payload.
   * Mutator may be async (e.g. encrypt new file body).
   * Only one save runs at a time: a second call while one is in flight throws.
   * A save that finishes after `lock()` is discarded (vault stays locked).
   */
  commit: (
    mutator: (archive: VaultArchive) => void | Promise<void>
  ) => Promise<void>
  /** Encrypt JSON and write as a new/updated encrypted file, then save. */
  putEncryptedFile: (
    path: string,
    json: JsonValue,
    options?: { icon?: string }
  ) => Promise<void>
  /**
   * Re-encrypt the outer vault blob under a new master password.
   * Does not rotate the file DEK. Session stays unlocked on success.
   */
  changeMasterPassword: (current: string, next: string) => Promise<void>
  /**
   * Encrypt the live vault (no recycle bin) as a CKV2 blob for download.
   * Uses the current master password.
   */
  exportEncryptedVault: () => Promise<EncryptedVaultBlob>
  /**
   * Decrypt an exported CKV2 blob and merge into a new isolated root folder.
   * Returns the path of that folder. Existing paths are never overwritten.
   */
  importEncryptedVault: (
    blob: EncryptedVaultBlob,
    password: string
  ) => Promise<string>
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<VaultArchive | null>(null)
  const [vaultName, setVaultName] = useState<string | null>(null)
  const [masterPassword, setMasterPassword] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fileDekKeyRef = useRef<CryptoKey | null>(null)
  const fileDekBytesRef = useRef<Uint8Array | null>(null)
  const objectKeyRef = useRef<string | null>(null)
  /** Latest committed payload, so back-to-back commits never start from a stale closure. */
  const payloadRef = useRef<VaultArchive | null>(null)
  /** Bumped by unlock/lock; saves from an older session must not touch state. */
  const sessionRef = useRef(0)
  /** Synchronous single-flight guard for saves (React `saving` updates too late). */
  const inFlightRef = useRef(false)

  const unlock = useCallback(async (password: string, name: string) => {
    const objectKey = toVaultObjectKey(name)
    const result = await unlockVault(password, objectKey)
    sessionRef.current += 1
    inFlightRef.current = false
    fileDekKeyRef.current = result.fileDekKey
    fileDekBytesRef.current = result.fileDekBytes
    objectKeyRef.current = objectKey
    payloadRef.current = result.payload
    setPayload(result.payload)
    setVaultName(objectKey.replace(/\.enc$/i, ""))
    setMasterPassword(password)
    setSaveError(null)
    setSaving(false)
  }, [])

  const lock = useCallback(() => {
    sessionRef.current += 1
    inFlightRef.current = false
    fileDekKeyRef.current = null
    fileDekBytesRef.current = null
    objectKeyRef.current = null
    payloadRef.current = null
    setPayload(null)
    setVaultName(null)
    setMasterPassword(null)
    setSaveError(null)
    setSaving(false)
  }, [])

  const decryptFile = useCallback(async (path: string): Promise<JsonValue> => {
    const archive = payload
    const key = fileDekKeyRef.current
    if (!archive || !key) {
      throw new Error("Vault is locked.")
    }
    const node = getNode(archive, path)
    if (!node || node.type !== "file") {
      throw new Error(`Not a file: ${path}`)
    }
    return decryptFileJson(
      { nonce: node.nonce, ciphertext: node.ciphertext },
      key
    )
  }, [payload])

  const commit = useCallback(
    async (mutator: (archive: VaultArchive) => void | Promise<void>) => {
      const current = payloadRef.current
      if (
        !current ||
        !masterPassword ||
        !fileDekBytesRef.current ||
        !objectKeyRef.current
      ) {
        throw new Error("Vault is locked.")
      }
      if (inFlightRef.current) {
        throw new Error("Another save is in progress. Try again in a moment.")
      }
      inFlightRef.current = true
      const session = sessionRef.current
      setSaving(true)
      setSaveError(null)
      try {
        const next = structuredClone(current)
        await mutator(next)
        await saveVault(
          next,
          fileDekBytesRef.current,
          masterPassword,
          objectKeyRef.current
        )
        if (session !== sessionRef.current) return
        payloadRef.current = next
        setPayload(next)
      } catch (err) {
        if (session !== sessionRef.current) throw err
        const message =
          err instanceof Error ? err.message : "Failed to save vault."
        setSaveError(message)
        throw err
      } finally {
        if (session === sessionRef.current) {
          inFlightRef.current = false
          setSaving(false)
        }
      }
    },
    [masterPassword]
  )

  const putEncryptedFile = useCallback(
    async (
      path: string,
      json: JsonValue,
      options?: { icon?: string }
    ) => {
      const key = fileDekKeyRef.current
      if (!key) throw new Error("Vault is locked.")
      await commit(async (archive) => {
        const enc = await encryptFileJson(json, key)
        putFile(archive, path, { ...enc, icon: options?.icon })
      })
    },
    [commit]
  )

  const changeMasterPassword = useCallback(
    async (current: string, next: string) => {
      const archive = payloadRef.current
      if (
        !archive ||
        !masterPassword ||
        !fileDekBytesRef.current ||
        !objectKeyRef.current
      ) {
        throw new Error("Vault is locked.")
      }
      if (current !== masterPassword) {
        throw new Error("Invalid master password.")
      }
      if (!next) {
        throw new Error("New password cannot be empty.")
      }
      if (next === masterPassword) {
        throw new Error("New password must be different from the current one.")
      }
      if (inFlightRef.current) {
        throw new Error("Another save is in progress. Try again in a moment.")
      }
      inFlightRef.current = true
      const session = sessionRef.current
      setSaving(true)
      setSaveError(null)
      try {
        await saveVault(
          archive,
          fileDekBytesRef.current,
          next,
          objectKeyRef.current
        )
        if (session !== sessionRef.current) return
        setMasterPassword(next)
      } catch (err) {
        if (session !== sessionRef.current) throw err
        const message =
          err instanceof Error ? err.message : "Failed to change master password."
        setSaveError(message)
        throw err
      } finally {
        if (session === sessionRef.current) {
          inFlightRef.current = false
          setSaving(false)
        }
      }
    },
    [masterPassword]
  )

  const exportEncryptedVault = useCallback(async (): Promise<EncryptedVaultBlob> => {
    if (!payload || !masterPassword || !fileDekBytesRef.current) {
      throw new Error("Vault is locked.")
    }
    return buildExportBlob(payload, fileDekBytesRef.current, masterPassword)
  }, [payload, masterPassword])

  const importEncryptedVault = useCallback(
    async (blob: EncryptedVaultBlob, password: string): Promise<string> => {
      const key = fileDekKeyRef.current
      if (!payload || !key) {
        throw new Error("Vault is locked.")
      }
      if (!password) {
        throw new Error("Import password cannot be empty.")
      }

      let folderPath = ""
      await commit(async (archive) => {
        const result = await mergeImportIntoArchive(
          archive,
          key,
          blob,
          password
        )
        folderPath = result.folderPath
      })
      return folderPath
    },
    [payload, commit]
  )

  const value = useMemo(
    () => ({
      unlocked: payload !== null,
      payload,
      vaultName,
      masterPassword,
      saving,
      saveError,
      unlock,
      lock,
      decryptFile,
      commit,
      putEncryptedFile,
      changeMasterPassword,
      exportEncryptedVault,
      importEncryptedVault,
    }),
    [
      payload,
      vaultName,
      masterPassword,
      saving,
      saveError,
      unlock,
      lock,
      decryptFile,
      commit,
      putEncryptedFile,
      changeMasterPassword,
      exportEncryptedVault,
      importEncryptedVault,
    ]
  )

  return (
    <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
  )
}

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) {
    throw new Error("useVault must be used within a VaultProvider")
  }
  return ctx
}
