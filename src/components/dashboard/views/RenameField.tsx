import { useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

type RenameFieldProps = {
  initialName: string
  /** Files select the name without its extension, like Finder. */
  isFile: boolean
  saving: boolean
  /** Resolve true when done; false keeps the field open (e.g. name taken). */
  onCommit: (name: string) => Promise<boolean>
  onCancel: () => void
  className?: string
}

/** Finder inline rename: Return/blur commits, Escape cancels. */
export function RenameField({
  initialName,
  isFile,
  saving,
  onCommit,
  onCancel,
  className,
}: RenameFieldProps) {
  const ref = useRef<HTMLInputElement | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: false })
    const dot = isFile ? initialName.lastIndexOf(".") : -1
    el.setSelectionRange(0, dot > 0 ? dot : initialName.length)
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function commit() {
    if (busy.current || saving) return
    busy.current = true
    const ok = await onCommit(ref.current?.value ?? initialName)
    busy.current = false
    if (!ok) ref.current?.focus()
  }

  return (
    <span className={cn("relative inline-flex min-w-0 items-center", className)}>
      <input
        ref={ref}
        defaultValue={initialName}
        disabled={saving}
        aria-label="Name"
        spellCheck={false}
        autoComplete="off"
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") {
            e.preventDefault()
            void commit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            if (!busy.current && !saving) onCancel()
          }
        }}
        onBlur={() => void commit()}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="h-[18px] w-full min-w-16 rounded-[3px] bg-mac-field px-1 text-[13px] text-mac-label shadow-[0_0_0_3px_var(--mac-focus),0_0_0_1px_var(--mac-accent)] outline-none disabled:opacity-70"
      />
      {saving ? (
        <Loader2 className="absolute right-1 size-3 animate-spin text-mac-label-2" aria-label="Saving" />
      ) : null}
    </span>
  )
}
