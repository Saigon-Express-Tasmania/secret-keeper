import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

type ToolbarButtonProps = Omit<ComponentProps<"button">, "children"> & {
  label: string
  icon: ReactNode
  pressed?: boolean
  /** Optional visible text after the icon. */
  text?: string
}

/** Borderless macOS toolbar button (hover/pressed backgrounds only). */
export function ToolbarButton({
  label,
  icon,
  pressed,
  text,
  className,
  ...props
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        "flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-[6px] px-1.5 text-mac-label-2 transition-colors outline-none select-none hover:bg-mac-hover hover:text-mac-label focus-visible:ring-[3px] focus-visible:ring-mac-focus active:bg-mac-sidebar-selection disabled:pointer-events-none disabled:opacity-30 aria-pressed:bg-mac-sidebar-selection aria-pressed:text-mac-label data-[state=open]:bg-mac-sidebar-selection pointer-coarse:h-9 pointer-coarse:min-w-9 [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:stroke-[1.6]",
        className
      )}
      {...props}
    >
      {icon}
      {text ? <span className="text-[12px]">{text}</span> : null}
    </button>
  )
}

export function ToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex shrink-0 items-center gap-0.5", className)}>{children}</div>
}
