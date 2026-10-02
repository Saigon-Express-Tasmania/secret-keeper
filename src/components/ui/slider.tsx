import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** Small macOS slider (thin track, round white knob). */
function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex h-4 w-full touch-none items-center select-none data-disabled:opacity-40",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-[3px] grow overflow-hidden rounded-full bg-black/15 dark:bg-white/20">
        <SliderPrimitive.Range className="absolute h-full bg-mac-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label="Icon size"
        className="block size-3.5 rounded-full bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.25),0_1px_2px_rgb(0_0_0/0.3)] outline-none focus-visible:ring-[3px] focus-visible:ring-mac-focus"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
