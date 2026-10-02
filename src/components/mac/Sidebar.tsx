import { useState, type ComponentProps, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

export function SidebarSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group/sec flex h-6 w-full items-center px-4 text-left text-[11px] font-semibold text-mac-label-3 outline-none select-none focus-visible:text-mac-label-2"
      >
        <span className="flex-1 truncate">{title}</span>
        <ChevronDown
          className={cn(
            "size-3 opacity-0 transition group-hover/sec:opacity-100 group-focus-visible/sec:opacity-100",
            !open && "-rotate-90"
          )}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
      {open ? <ul className="flex flex-col gap-px">{children}</ul> : null}
    </div>
  )
}

type SidebarItemProps = Omit<ComponentProps<"button">, "children"> & {
  icon: ReactNode
  label: string
  active?: boolean
  /** Highlight while something is dragged over it. */
  dropTarget?: boolean
  /** Dimmed (e.g. cut to the clipboard). */
  dimmed?: boolean
  badge?: ReactNode
}

export function SidebarItem({
  icon,
  label,
  active = false,
  dropTarget = false,
  dimmed = false,
  badge,
  className,
  ...props
}: SidebarItemProps) {
  return (
    <li>
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          "mx-2.5 flex h-7 w-[calc(100%-1.25rem)] items-center gap-2 rounded-[5px] px-2 text-left text-[13px] text-mac-label outline-none select-none focus-visible:ring-[3px] focus-visible:ring-mac-focus pointer-coarse:h-10",
          active ? "bg-mac-sidebar-selection" : "hover:bg-mac-hover",
          dropTarget && "bg-mac-accent text-white [&_svg]:text-white",
          dimmed && "opacity-50",
          className
        )}
        {...props}
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-mac-accent [&_svg]:size-4 [&_svg]:stroke-[1.75]">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge !== undefined && badge !== null ? (
          <span className={cn("ml-auto text-[11px] text-mac-label-2 tabular-nums", dropTarget && "text-white/80")}>
            {badge}
          </span>
        ) : null}
      </button>
    </li>
  )
}
