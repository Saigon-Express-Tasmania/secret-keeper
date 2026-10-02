import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react"
import { Loader2, Lock } from "lucide-react"

import {
  AccountEditor,
  type AccountEditorHandle,
} from "@/components/editor/AccountEditor"
import { NodeIcon } from "@/components/icons/NodeIcon"
import { useVault } from "@/context/VaultContext"
import type { JsonValue } from "@/lib/vault/fs"
import {
  formatNodeDate,
  formatNodeSize,
  getNode,
  pathBasename,
  resolveNodeIcon,
} from "@/lib/vault/fs"

type FileViewerProps = {
  path: string
  editorRef?: MutableRefObject<AccountEditorHandle | null>
}

const DECRYPTED_NOTE =
  "Decrypted while open — plaintext clears when you leave this file."

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; json: JsonValue }

export function FileViewer({ path, editorRef }: FileViewerProps) {
  const { decryptFile, putEncryptedFile, payload, saving, saveError } =
    useVault()
  const [state, setState] = useState<ViewState>({ status: "loading" })
  const decryptFileRef = useRef(decryptFile)

  useEffect(() => {
    decryptFileRef.current = decryptFile
  }, [decryptFile])

  const node = payload ? getNode(payload, path) : null
  const fileNode = node?.type === "file" ? node : null
  const name = pathBasename(path)

  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })

    decryptFileRef
      .current(path)
      .then((json) => {
        if (!cancelled) setState({ status: "ready", json })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "Failed to decrypt file.",
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <AccountEditor
        key={path}
        initialJson={state.json}
        saving={saving}
        saveError={saveError}
        onSave={handleSave}
        editorRef={editorRef}
        meta={
          <>
            <div className="flex min-w-0 items-center gap-2 text-mac-label">
              <NodeIcon
                iconId={
                  fileNode ? resolveNodeIcon(fileNode, name) : undefined
                }
                kind="file"
                size={18}
              />
              <span className="truncate font-medium">{name}</span>
              <span title={DECRYPTED_NOTE} className="shrink-0 text-mac-label-2">
                <Lock className="size-3.5" aria-hidden />
                <span className="sr-only">{DECRYPTED_NOTE}</span>
              </span>
            </div>
            <span>Created {formatNodeDate(fileNode?.createdAt)}</span>
            <span>Modified {formatNodeDate(fileNode?.modifiedAt)}</span>
            <span>{fileNode ? formatNodeSize(fileNode) : "—"}</span>
          </>
        }
      />
    </div>
  )
}
