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
  const [masterPassword, setMasterPassword] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fileDekKeyRef = useRef<CryptoKey | null>(null)
  const fileDekBytesRef = useRef<Uint8Array | null>(null)
  const objectKeyRef = useRef<string | null>(null)

  const unlock = useCallback(async (password: string, vaultName: string) => {
    const objectKey = toVaultObjectKey(vaultName)
    const result = await unlockVault(password, objectKey)
    fileDekKeyRef.current = result.fileDekKey
    fileDekBytesRef.current = result.fileDekBytes
    objectKeyRef.current = objectKey
    setPayload(result.payload)
    setMasterPassword(password)
    setSaveError(null)
  }, [])

  const lock = useCallback(() => {
    fileDekKeyRef.current = null
    fileDekBytesRef.current = null
    objectKeyRef.current = null
    setPayload(null)
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
      if (
        !payload ||
        !masterPassword ||
        !fileDekBytesRef.current ||
        !objectKeyRef.current
      ) {
        throw new Error("Vault is locked.")
      }
      setSaving(true)
      setSaveError(null)
      const previous = payload
      try {
        const next = structuredClone(payload)
        await mutator(next)
        await saveVault(
          next,
          fileDekBytesRef.current,
          masterPassword,
          objectKeyRef.current
        )
        setPayload(next)
      } catch (err) {
        setPayload(previous)
        const message =
          err instanceof Error ? err.message : "Failed to save vault."
        setSaveError(message)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [payload, masterPassword]
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
      if (
        !payload ||
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
      setSaving(true)
      setSaveError(null)
      try {
        await saveVault(
          payload,
          fileDekBytesRef.current,
          next,
          objectKeyRef.current
        )
        setMasterPassword(next)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to change master password."
        setSaveError(message)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [payload, masterPassword]
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
