import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type MacWindowProps = {
  zoomed: boolean
  minimized: boolean
  className?: string
  children: ReactNode
  "aria-label"?: string
}

/**
 * Window frame (rounded corners, hairline border, deep shadow). Minimizing
 * only hides it — it stays mounted so editor state survives.
 */
export function MacWindow({
  zoomed,
  minimized,
  className,
  children,
  "aria-label": ariaLabel,
}: MacWindowProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      aria-hidden={minimized || undefined}
      inert={minimized}
      data-zoomed={zoomed || undefined}
      className={cn(
        "relative flex overflow-hidden bg-mac-content text-mac-label md:rounded-window md:shadow-mac-window",
        "transition-[opacity,transform] duration-200 motion-reduce:transition-none",
        minimized && "pointer-events-none translate-y-6 scale-[0.96] opacity-0",
        className
      )}
    >
      {children}
    </div>
  )
}
