import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { Loader2, Lock } from "lucide-react"

import { glyphFor } from "@/components/dashboard/views/itemDisplay"
import {
  AccountEditor,
  type AccountEditorHandle,
} from "@/components/editor/AccountEditor"
import { FinderIcon } from "@/components/icons/FinderIcon"
import { useVault } from "@/context/VaultContext"
import { formatFinderDate, formatFinderSize } from "@/lib/finder/format"
import { nodeSizeBytes, safeGetNode, vaultItem } from "@/lib/finder/items"
import type { JsonValue } from "@/lib/vault/fs"

type FileViewerProps = {
  path: string
  editorRef?: RefObject<AccountEditorHandle | null>
  onDirtyChange?: (dirty: boolean) => void
}

const DECRYPTED_NOTE =
  "Decrypted while open — plaintext clears when you leave this file."

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; json: JsonValue }

/** Decrypts one account file on open and hosts the editor. Keyed by path. */
export function FileViewer({ path, editorRef, onDirtyChange }: FileViewerProps) {
  const { decryptFile, putEncryptedFile, payload, saving, saveError } = useVault()
  const [state, setState] = useState<ViewState>({ status: "loading" })
  const decryptFileRef = useRef(decryptFile)

  useEffect(() => {
    decryptFileRef.current = decryptFile
  }, [decryptFile])

  const node = payload ? safeGetNode(payload, path) : null
  const fileNode = node?.type === "file" ? node : null

  useEffect(() => {
    let cancelled = false
    decryptFileRef
      .current(path)
      .then((json) => {
        if (!cancelled) setState({ status: "ready", json })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Failed to decrypt file.",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [path])

  const handleSave = useCallback(
    async (json: JsonValue) => {
      await putEncryptedFile(path, json)
    },
    [path, putEncryptedFile]
  )

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-8 text-[13px] text-mac-label-2">
        <Loader2 className="size-4 animate-spin" />
        Decrypting…
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-mac-red">
        {state.message}
      </div>
    )
  }

  const item = fileNode ? vaultItem(path, fileNode) : null

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <AccountEditor
        key={path}
        initialJson={state.json}
        saving={saving}
        saveError={saveError}
        onSave={handleSave}
        editorRef={editorRef}
        onDirtyChange={onDirtyChange}
        meta={
          <>
            <span className="flex min-w-0 items-center gap-1.5 text-mac-label">
              <FinderIcon kind="file" glyphId={item ? glyphFor(item) : null} size={16} />
              <span className="truncate font-medium">{item?.name}</span>
              <span title={DECRYPTED_NOTE} className="shrink-0 text-mac-label-2">
                <Lock className="size-3" aria-hidden />
                <span className="sr-only">{DECRYPTED_NOTE}</span>
              </span>
            </span>
            <span>Modified {formatFinderDate(fileNode?.modifiedAt)}</span>
            {fileNode ? <span>{formatFinderSize(nodeSizeBytes(fileNode))}</span> : null}
          </>
        }
      />
    </div>
  )
}
