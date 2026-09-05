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
import type { JsonValue, VaultArchive } from "@/lib/vault/fs"
import { getNode, putFile } from "@/lib/vault/fs"
import { saveVault, unlockVault } from "@/lib/vault/persist"

type VaultContextValue = {
  unlocked: boolean
  payload: VaultArchive | null
  /** In-memory only; cleared on lock. */
  masterPassword: string | null
  saving: boolean
  saveError: string | null
  unlock: (masterPassword: string) => Promise<void>
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
  putEncryptedFile: (path: string, json: JsonValue) => Promise<void>
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<VaultArchive | null>(null)
  const [masterPassword, setMasterPassword] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fileDekKeyRef = useRef<CryptoKey | null>(null)
  const fileDekBytesRef = useRef<Uint8Array | null>(null)

  const unlock = useCallback(async (password: string) => {
    const result = await unlockVault(password)
    fileDekKeyRef.current = result.fileDekKey
    fileDekBytesRef.current = result.fileDekBytes
    setPayload(result.payload)
    setMasterPassword(password)
    setSaveError(null)
  }, [])

  const lock = useCallback(() => {
    fileDekKeyRef.current = null
    fileDekBytesRef.current = null
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
      if (!payload || !masterPassword || !fileDekBytesRef.current) {
        throw new Error("Vault is locked.")
      }
      setSaving(true)
      setSaveError(null)
      const previous = payload
      try {
        const next = structuredClone(payload)
        await mutator(next)
        await saveVault(next, fileDekBytesRef.current, masterPassword)
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
    async (path: string, json: JsonValue) => {
      const key = fileDekKeyRef.current
      if (!key) throw new Error("Vault is locked.")
      await commit(async (archive) => {
        const enc = await encryptFileJson(json, key)
        putFile(archive, path, enc)
      })
    },
    [commit]
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
