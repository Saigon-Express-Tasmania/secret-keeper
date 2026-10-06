import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { Loader2, Pencil } from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { resolveCommand } from "@/components/dashboard/hooks/useFinderCommands"
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

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; json: JsonValue }

/** The file's icon as a large avatar; clicking it opens Change Icon. */
function IconAvatar({
  glyphId,
  enabled,
  onChange,
}: {
  glyphId: string | null
  enabled: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={!enabled}
      aria-label="Change Icon…"
      title="Change Icon…"
      className="group relative flex size-28 shrink-0 items-center justify-center rounded-[26px] bg-mac-group shadow-[0_0_0_0.5px_var(--mac-separator),0_1px_3px_rgb(0_0_0/0.08)] transition-shadow outline-none hover:shadow-[0_0_0_2px_var(--mac-accent),0_1px_3px_rgb(0_0_0/0.08)] focus-visible:ring-[3px] focus-visible:ring-mac-focus disabled:cursor-default disabled:hover:shadow-[0_0_0_0.5px_var(--mac-separator),0_1px_3px_rgb(0_0_0/0.08)]"
    >
      <FinderIcon kind="file" glyphId={glyphId} size={84} />
      <span
        aria-hidden
        className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border border-mac-separator bg-mac-group text-mac-label-2 shadow-sm transition-colors group-hover:text-mac-accent group-disabled:opacity-50 [&_svg]:size-3.5"
      >
        <Pencil />
      </span>
    </button>
  )
}

/** Decrypts one account file on open and hosts the editor. Keyed by path. */
export function FileViewer({ path, editorRef, onDirtyChange }: FileViewerProps) {
  const c = useFinder()
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
  // The icon lives on the file entry, not in the encrypted body: changing it
  // saves the vault right away and leaves unsaved edits in the form alone.
  const changeIcon = resolveCommand(c, "file.changeIcon", item ? [item] : [])

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
        avatar={
          <IconAvatar
            glyphId={item ? glyphFor(item) : null}
            enabled={changeIcon.enabled}
            onChange={changeIcon.run}
          />
        }
        details={
          <>
            <span className="max-w-full truncate font-medium text-mac-label">{item?.name}</span>
            {fileNode ? <span>{formatFinderSize(nodeSizeBytes(fileNode))}</span> : null}
            <span>Modified {formatFinderDate(fileNode?.modifiedAt)}</span>
          </>
        }
      />
    </div>
  )
}
