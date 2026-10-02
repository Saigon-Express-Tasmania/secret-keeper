import type { ReactNode } from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

export type SegmentedItem<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
  disabled?: boolean
}

type SegmentedControlProps<T extends string> = {
  value: T
  onValueChange: (value: T) => void
  items: SegmentedItem<T>[]
  /** Show only icons (labels become aria-labels / tooltips). */
  iconOnly?: boolean
  size?: "sm" | "md"
  className?: string
  "aria-label": string
}

/** macOS segmented control (single selection, can't be deselected). */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  items,
  iconOnly = false,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center rounded-[7px] bg-black/[0.06] p-[2px] dark:bg-white/[0.09]",
        size === "sm" ? "h-[22px]" : "h-7",
        className
      )}
    >
      {items.map((item) => (
        <ToggleGroupPrimitive.Item
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          aria-label={item.label}
          title={iconOnly ? item.label : undefined}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "flex h-full min-w-0 items-center justify-center gap-1 rounded-[5px] text-mac-label-2 transition-colors outline-none select-none hover:text-mac-label focus-visible:ring-[3px] focus-visible:ring-mac-focus disabled:opacity-35 data-[state=on]:bg-mac-control data-[state=on]:text-mac-label data-[state=on]:shadow-[0_0_0_0.5px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.12)] dark:data-[state=on]:bg-white/25 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
            size === "sm" ? "px-2 text-[11px]" : "px-2.5 text-[12px]",
            iconOnly && (size === "sm" ? "w-7 px-0" : "w-8 px-0")
          )}
        >
          {item.icon}
          {iconOnly ? null : <span className="truncate">{item.label}</span>}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}
