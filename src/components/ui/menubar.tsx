import * as React from "react"
import { Check, ChevronRight } from "lucide-react"
import { Menubar as MenubarPrimitive } from "radix-ui"

import {
  menuContentClass,
  menuIndicatorClass,
  menuItemClass,
  menuLabelClass,
  menuSeparatorClass,
  menuShortcutClass,
} from "@/components/ui/menu-styles"
import { cn } from "@/lib/utils"

function Menubar({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Root>) {
  return (
    <MenubarPrimitive.Root
      data-slot="menubar"
      className={cn("flex h-full items-center", className)}
      {...props}
    />
  )
}

function MenubarMenu({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />
}

function MenubarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Trigger>) {
  return (
    <MenubarPrimitive.Trigger
      data-slot="menubar-trigger"
      className={cn(
        "flex h-[22px] cursor-default items-center rounded-[4px] px-2.5 text-[13px] leading-none outline-none select-none focus-visible:bg-black/10 data-[state=open]:bg-black/10 dark:focus-visible:bg-white/15 dark:data-[state=open]:bg-white/15",
        className
      )}
      {...props}
    />
  )
}

function MenubarContent({
  className,
  align = "start",
  alignOffset = -4,
  sideOffset = 3,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content>) {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.Content
        data-slot="menubar-content"
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        className={cn(
          menuContentClass,
          "origin-(--radix-menubar-content-transform-origin)",
          className
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  )
}

function MenubarItem({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item>) {
  return (
    <MenubarPrimitive.Item
      data-slot="menubar-item"
      className={cn(menuItemClass, className)}
      {...props}
    />
  )
}

function MenubarCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem>) {
  return (
    <MenubarPrimitive.CheckboxItem
      data-slot="menubar-checkbox-item"
      className={cn(menuItemClass, className)}
      {...props}
    >
      <span className={menuIndicatorClass}>
        <MenubarPrimitive.ItemIndicator>
          <Check className="size-3! stroke-[2.5]" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.CheckboxItem>
  )
}

function MenubarRadioGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioGroup>) {
  return (
    <MenubarPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
  )
}

function MenubarRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioItem>) {
  return (
    <MenubarPrimitive.RadioItem
      data-slot="menubar-radio-item"
      className={cn(menuItemClass, className)}
      {...props}
    >
      <span className={menuIndicatorClass}>
        <MenubarPrimitive.ItemIndicator>
          <Check className="size-3! stroke-[2.5]" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.RadioItem>
  )
}

function MenubarSub({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Sub>) {
  return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />
}

function MenubarSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubTrigger>) {
  return (
    <MenubarPrimitive.SubTrigger
      data-slot="menubar-sub-trigger"
      className={cn(menuItemClass, className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-3! stroke-[2.25]" />
    </MenubarPrimitive.SubTrigger>
  )
}

function MenubarSubContent({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubContent>) {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.SubContent
        data-slot="menubar-sub-content"
        className={cn(
          menuContentClass,
          "origin-(--radix-menubar-content-transform-origin)",
          className
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  )
}

function MenubarLabel({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Label>) {
  return (
    <MenubarPrimitive.Label
      data-slot="menubar-label"
      className={cn(menuLabelClass, className)}
      {...props}
    />
  )
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
  return (
    <MenubarPrimitive.Separator
      data-slot="menubar-separator"
      className={cn(menuSeparatorClass, className)}
      {...props}
    />
  )
}

function MenubarShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menubar-shortcut"
      className={cn(menuShortcutClass, className)}
      {...props}
    />
  )
}

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarLabel,
  MenubarSeparator,
  MenubarShortcut,
}
