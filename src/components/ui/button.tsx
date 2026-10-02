import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** macOS push-button styles (accent default button, regular, borderless). */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] leading-none font-normal transition-[background-color,box-shadow,filter,opacity] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_0.5px_1px_rgb(0_0_0/0.25),inset_0_0.5px_0_rgb(255_255_255/0.22)] hover:brightness-105 active:brightness-90",
        destructive:
          "bg-mac-red text-white shadow-[0_0.5px_1px_rgb(0_0_0/0.25),inset_0_0.5px_0_rgb(255_255_255/0.22)] hover:brightness-105 active:brightness-90",
        outline:
          "bg-mac-control text-foreground shadow-[0_0_0_0.5px_var(--mac-control-border),0_0.5px_1.5px_rgb(0_0_0/0.14)] active:brightness-90 dark:shadow-[0_0_0_0.5px_var(--mac-control-border),0_0.5px_1px_rgb(0_0_0/0.4)]",
        secondary:
          "bg-mac-control text-foreground shadow-[0_0_0_0.5px_var(--mac-control-border),0_0.5px_1.5px_rgb(0_0_0/0.14)] active:brightness-90 dark:shadow-[0_0_0_0.5px_var(--mac-control-border),0_0.5px_1px_rgb(0_0_0/0.4)]",
        ghost:
          "text-foreground hover:bg-mac-hover active:bg-mac-sidebar-selection",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-3 pointer-coarse:h-9",
        sm: "h-6 px-2.5 text-[12px] pointer-coarse:h-8",
        lg: "h-8 px-5",
        icon: "size-7 pointer-coarse:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
