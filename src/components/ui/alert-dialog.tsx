import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

/** macOS alert: compact centered panel with icon, bold title and message. */
function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-50 bg-black/15 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 dark:bg-black/35"
      />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 flex w-[17.5rem] max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col items-center gap-3 rounded-xl bg-mac-menu p-4 pt-5 text-center text-[13px] text-mac-label shadow-mac-window backdrop-blur-2xl backdrop-saturate-150 duration-150 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-[13px] leading-tight font-bold", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-[11px] leading-snug text-mac-label", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("mt-1 flex w-full flex-col gap-2", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  destructive = false,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  destructive?: boolean
}) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(
        buttonVariants({ variant: destructive ? "destructive" : "default" }),
        "w-full",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant: "outline" }), "w-full", className)}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
}
