import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-mac-field-border bg-mac-field px-2 py-1.5 text-base shadow-[inset_0_0.5px_1px_rgb(0_0_0/0.06)] transition-[box-shadow,border-color] outline-none placeholder:text-mac-label-3 focus-visible:border-mac-accent/70 focus-visible:ring-[3px] focus-visible:ring-mac-focus disabled:cursor-not-allowed disabled:opacity-50 md:text-[13px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
