import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import type { JsonValue } from "@/lib/vault/fs"
import { useVault } from "@/context/VaultContext"

type FileViewerProps = {
  path: string
}

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; json: JsonValue }

export function FileViewer({ path }: FileViewerProps) {
  const { decryptFile } = useVault()
  const [state, setState] = useState<ViewState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false

    decryptFile(path)
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
  }, [path, decryptFile])

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Decrypting…
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
        {state.message}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-2 text-xs text-muted-foreground">
        Decrypted for viewing only — plaintext is cleared when you leave this
        file.
      </div>
      <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {JSON.stringify(state.json, null, 2)}
      </pre>
    </div>
  )
}
