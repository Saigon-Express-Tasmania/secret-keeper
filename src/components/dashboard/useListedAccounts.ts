import { useEffect, useMemo, useRef, useState } from "react"

import { useVault } from "@/context/VaultContext"
import {
  parseAccount,
  type AccountEntry,
} from "@/lib/account/schema"
import type { FsFile } from "@/lib/vault/fs"

export type ListedAccountState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; account: AccountEntry }
  | { status: "error" }

type FileRef = {
  path: string
  nonce: string
  ciphertext: string
}

function cacheKey(ref: FileRef): string {
  return `${ref.path}\0${ref.nonce}\0${ref.ciphertext}`
}

function filesFingerprint(files: FileRef[]): string {
  return files.map((f) => cacheKey(f)).join("\n")
}

/**
 * Decrypt visible listing files when enabled. Cache by path+nonce+ciphertext.
 * Clears when disabled. Does not persist plaintext beyond this hook's state.
 */
export function useListedAccounts(
  enabled: boolean,
  files: FileRef[]
): Map<string, ListedAccountState> {
  const { decryptFile } = useVault()
  const [byPath, setByPath] = useState<Map<string, ListedAccountState>>(
    () => new Map()
  )
  const cacheRef = useRef<Map<string, AccountEntry>>(new Map())
  const decryptFileRef = useRef(decryptFile)
  const fingerprint = useMemo(() => filesFingerprint(files), [files])

  useEffect(() => {
    decryptFileRef.current = decryptFile
  }, [decryptFile])

  useEffect(() => {
    if (!enabled) {
      cacheRef.current.clear()
      setByPath(new Map())
      return
    }

    let cancelled = false
    const fileList = files
    const needed = new Map<string, FileRef>()
    for (const f of fileList) {
      needed.set(f.path, f)
    }

    const validKeys = new Set<string>()
    for (const f of fileList) {
      validKeys.add(cacheKey(f))
    }
    for (const key of [...cacheRef.current.keys()]) {
      if (!validKeys.has(key)) {
        cacheRef.current.delete(key)
      }
    }

    const next = new Map<string, ListedAccountState>()
    const toDecrypt: FileRef[] = []

    for (const f of fileList) {
      const key = cacheKey(f)
      const cached = cacheRef.current.get(key)
      if (cached) {
        next.set(f.path, { status: "ready", account: cached })
      } else {
        next.set(f.path, { status: "loading" })
        toDecrypt.push(f)
      }
    }

    setByPath(next)

    if (toDecrypt.length === 0) return

    void Promise.all(
      toDecrypt.map(async (f) => {
        try {
          const json = await decryptFileRef.current(f.path)
          if (cancelled) return
          const current = needed.get(f.path)
          if (
            !current ||
            current.nonce !== f.nonce ||
            current.ciphertext !== f.ciphertext
          ) {
            return
          }
          const account = parseAccount(json)
          cacheRef.current.set(cacheKey(f), account)
          setByPath((prev) => {
            const copy = new Map(prev)
            copy.set(f.path, { status: "ready", account })
            return copy
          })
        } catch {
          if (cancelled) return
          setByPath((prev) => {
            const copy = new Map(prev)
            copy.set(f.path, { status: "error" })
            return copy
          })
        }
      })
    )

    return () => {
      cancelled = true
    }
    // fingerprint stands in for files identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fingerprint])

  return byPath
}

/** Build FileRef list from path + FsFile pairs. */
export function toFileRefs(
  items: { path: string; node: FsFile }[]
): FileRef[] {
  return items.map(({ path, node }) => ({
    path,
    nonce: node.nonce,
    ciphertext: node.ciphertext,
  }))
}
