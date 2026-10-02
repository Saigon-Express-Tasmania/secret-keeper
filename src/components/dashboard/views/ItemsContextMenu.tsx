import { useRef, type ReactElement } from "react"

import { useFinder } from "@/components/dashboard/finderContext"
import { MenuNodes } from "@/components/dashboard/menus/MenuNodes"
import { backgroundMenu, itemMenu } from "@/components/dashboard/menus/model"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { isEditableTarget } from "@/lib/finder/shortcuts"

function itemKeyFrom(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>("[data-item-key]")?.dataset.itemKey ?? null
}

/**
 * One context menu for a whole view. Right-clicking an unselected item
 * selects it first (like Finder); right-clicking empty space clears the
 * selection and shows the folder menu.
 */
export function ItemsContextMenu({ children }: { children: ReactElement }) {
  const c = useFinder()
  const target = useRef<string | null>(null)
  const disabled = !!c.state.rename || !!c.state.phantom
  const nodes = c.model.selectedItems.length > 0 ? itemMenu(c) : backgroundMenu(c)

  return (
    <ContextMenu
      modal={false}
      onOpenChange={(open) => {
        c.win.setMenuOpen(open)
        if (!open) return
        const key = target.current
        if (key && c.model.itemsByKey.get(key)?.source !== "phantom") {
          if (!c.state.selection.keys.has(key)) c.dispatch({ type: "setSelection", keys: [key] })
        } else {
          c.dispatch({ type: "clearSelection" })
        }
      }}
    >
      <ContextMenuTrigger
        asChild
        disabled={disabled}
        onContextMenu={(e) => {
          target.current = itemKeyFrom(e.target)
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") target.current = itemKeyFrom(e.target)
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (!isEditableTarget(document.activeElement)) {
            c.contentRef.current?.focus({ preventScroll: true })
          }
        }}
      >
        <MenuNodes nodes={nodes} flavor="context" />
      </ContextMenuContent>
    </ContextMenu>
  )
}
