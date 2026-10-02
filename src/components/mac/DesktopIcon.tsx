import { useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Icon on the desktop (e.g. the minimized vault). Double-click or Enter opens. */
export function DesktopIcon({
  icon,
  label,
  onOpen,
}: {
  icon: ReactNode
  label: string
  onOpen: () => void
}) {
  const [selected, setSelected] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setSelected(true)}
      onBlur={() => setSelected(false)}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || (e.key === "ArrowDown" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          onOpen()
        }
      }}
      className="flex w-24 flex-col items-center gap-1 outline-none select-none"
      title={`Open ${label}`}
    >
      <span className={cn("rounded-[6px] p-1", selected && "bg-black/25")}>{icon}</span>
      <span
        className={cn(
          "max-w-full truncate rounded-[3px] px-1 text-[12px] font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]",
          selected && "bg-mac-selection [text-shadow:none]"
        )}
      >
        {label}
      </span>
    </button>
  )
}
