import * as React from "react"

import { cn } from "@/lib/utils"

/** macOS text field: hairline border, soft accent focus halo. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-7 w-full min-w-0 rounded-md border border-mac-field-border bg-mac-field px-2 py-1 text-base shadow-[inset_0_0.5px_1px_rgb(0_0_0/0.06)] transition-[box-shadow,border-color] outline-none file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-foreground placeholder:text-mac-label-3 focus-visible:border-mac-accent/70 focus-visible:ring-[3px] focus-visible:ring-mac-focus disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-9 md:text-[13px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
