import { useCallback, useRef, useState, type RefObject } from "react"

import type { AccountEditorHandle } from "@/components/editor/AccountEditor"

export type LeaveGuard = {
  /**
   * Resolves true when it's fine to leave the open file: nothing open, no
   * edits, or the user chose Save (and it worked) / Don't Save.
   */
  confirm: () => Promise<boolean>
  /** Props for the Save / Don't Save / Cancel sheet. */
  dialog: {
    open: boolean
    busy: boolean
    onSave: () => void
    onDiscard: () => void
    onCancel: () => void
  }
}

export function useLeaveGuard(
  editorRef: RefObject<AccountEditorHandle | null>
): LeaveGuard {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef<{ promise: Promise<boolean>; resolve: (v: boolean) => void } | null>(null)

  const settle = useCallback((value: boolean) => {
    const p = pending.current
    pending.current = null
    setOpen(false)
    setBusy(false)
    p?.resolve(value)
  }, [])

  const confirm = useCallback((): Promise<boolean> => {
    if (!editorRef.current?.isDirty()) return Promise.resolve(true)
    if (pending.current) return pending.current.promise
    let resolve!: (v: boolean) => void
    const promise = new Promise<boolean>((r) => {
      resolve = r
    })
    pending.current = { promise, resolve }
    setOpen(true)
    return promise
  }, [editorRef])

  const onSave = useCallback(() => {
    const editor = editorRef.current
    if (!editor) {
      settle(true)
      return
    }
    setBusy(true)
    void editor.save().then((ok) => {
      if (ok) settle(true)
      else setBusy(false)
    })
  }, [editorRef, settle])

  const onDiscard = useCallback(() => {
    editorRef.current?.discard()
    settle(true)
  }, [editorRef, settle])

  const onCancel = useCallback(() => settle(false), [settle])

  return { confirm, dialog: { open, busy, onSave, onDiscard, onCancel } }
}
