/**
 * Shared macOS menu class strings so context menus, dropdowns and the menu
 * bar all look the same (translucent panel, 22px rows, accent highlight).
 */

export const menuContentClass =
  "z-50 min-w-[13rem] overflow-x-hidden overflow-y-auto rounded-[7px] bg-mac-menu p-[5px] text-[13px] leading-none text-mac-label shadow-mac-popover backdrop-blur-2xl backdrop-saturate-150 outline-none select-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-75"

export const menuItemClass =
  "group relative flex h-[22px] cursor-default items-center gap-2 rounded-[4px] pr-2.5 pl-5 whitespace-nowrap outline-none data-highlighted:bg-mac-accent data-highlighted:text-white data-disabled:pointer-events-none data-disabled:opacity-35 data-[state=open]:bg-mac-accent data-[state=open]:text-white pointer-coarse:h-9 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0"

export const menuDestructiveClass =
  "text-mac-red data-highlighted:bg-mac-red data-highlighted:text-white"

export const menuIndicatorClass =
  "pointer-events-none absolute left-[5px] flex size-3 items-center justify-center"

export const menuShortcutClass =
  "ml-auto pl-6 text-[12px] tracking-[0.08em] text-mac-label-3 group-data-highlighted:text-white/80"

export const menuSeparatorClass = "mx-2.5 my-[5px] h-px bg-mac-separator"

export const menuLabelClass =
  "px-5 pt-1.5 pb-1 text-[11px] font-semibold text-mac-label-2"
