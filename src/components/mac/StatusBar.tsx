import type { ReactNode } from "react"

/** Finder status bar: centred item count with optional side slots. */
export function StatusBar({
  left,
  center,
  right,
}: {
  left?: ReactNode
  center: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="grid h-[22px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-mac-separator bg-mac-content px-3 text-[11px] text-mac-label-2 select-none">
      <div className="flex min-w-0 items-center gap-1.5 truncate">{left}</div>
      <div className="truncate text-center" aria-live="polite">
        {center}
      </div>
      <div className="flex min-w-0 items-center justify-end">{right}</div>
    </div>
  )
}
