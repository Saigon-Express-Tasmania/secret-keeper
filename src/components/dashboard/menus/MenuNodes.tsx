import type { ComponentType, ReactNode } from "react"

import { useFinder } from "@/components/dashboard/finderContext"
import { resolveCommand } from "@/components/dashboard/hooks/useFinderCommands"
import type { MenuNode } from "@/components/dashboard/menus/model"
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MenubarCheckboxItem,
  MenubarItem,
  MenubarLabel,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
} from "@/components/ui/menubar"

export type MenuFlavor = "menubar" | "dropdown" | "context"

type ItemProps = {
  disabled?: boolean
  checked?: boolean
  onSelect?: (event: Event) => void
  children?: ReactNode
}
type Plain = { children?: ReactNode }

type Kit = {
  Item: ComponentType<ItemProps>
  Check: ComponentType<ItemProps>
  Separator: ComponentType<Plain>
  Label: ComponentType<Plain>
  Sub: ComponentType<Plain>
  SubTrigger: ComponentType<ItemProps>
  SubContent: ComponentType<Plain>
  Shortcut: ComponentType<Plain>
}

const KITS = {
  menubar: {
    Item: MenubarItem,
    Check: MenubarCheckboxItem,
    Separator: MenubarSeparator,
    Label: MenubarLabel,
    Sub: MenubarSub,
    SubTrigger: MenubarSubTrigger,
    SubContent: MenubarSubContent,
    Shortcut: MenubarShortcut,
  },
  dropdown: {
    Item: DropdownMenuItem,
    Check: DropdownMenuCheckboxItem,
    Separator: DropdownMenuSeparator,
    Label: DropdownMenuLabel,
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent,
    Shortcut: DropdownMenuShortcut,
  },
  context: {
    Item: ContextMenuItem,
    Check: ContextMenuCheckboxItem,
    Separator: ContextMenuSeparator,
    Label: ContextMenuLabel,
    Sub: ContextMenuSub,
    SubTrigger: ContextMenuSubTrigger,
    SubContent: ContextMenuSubContent,
    Shortcut: ContextMenuShortcut,
  },
} as unknown as Record<MenuFlavor, Kit>

/** Drop leading, trailing and doubled separators. */
function tidy(nodes: MenuNode[]): MenuNode[] {
  const out: MenuNode[] = []
  for (const node of nodes) {
    if (node.type === "sep" && (out.length === 0 || out[out.length - 1]!.type === "sep")) continue
    out.push(node)
  }
  while (out.length && out[out.length - 1]!.type === "sep") out.pop()
  return out
}

/**
 * Run menu actions after the menu has closed, so dialogs/rename fields opened
 * by them don't fight the menu's focus restoration.
 */
function later(fn: () => void) {
  window.setTimeout(fn, 0)
}

export function MenuNodes({ nodes, flavor }: { nodes: MenuNode[]; flavor: MenuFlavor }) {
  const c = useFinder()
  const kit = KITS[flavor]

  function render(node: MenuNode, index: number): ReactNode {
    switch (node.type) {
      case "sep":
        return <kit.Separator key={`sep-${index}`} />
      case "label":
        return <kit.Label key={`label-${index}`}>{node.label}</kit.Label>
      case "sub":
        return (
          <kit.Sub key={`sub-${node.label}`}>
            <kit.SubTrigger disabled={node.disabled}>{node.label}</kit.SubTrigger>
            <kit.SubContent>{tidy(node.children).map(render)}</kit.SubContent>
          </kit.Sub>
        )
      case "action": {
        const Comp = node.checked === undefined ? kit.Item : kit.Check
        return (
          <Comp
            key={node.key}
            disabled={node.disabled}
            checked={node.checked}
            onSelect={() => later(node.onSelect)}
          >
            {node.label}
          </Comp>
        )
      }
      case "cmd": {
        const r = resolveCommand(c, node.id, node.items)
        const Comp = r.checked === undefined ? kit.Item : kit.Check
        return (
          <Comp
            key={node.id}
            disabled={!r.enabled}
            checked={r.checked}
            onSelect={() => later(r.run)}
          >
            {r.label}
            {r.shortcut ? <kit.Shortcut>{r.shortcut}</kit.Shortcut> : null}
          </Comp>
        )
      }
    }
  }

  return <>{tidy(nodes).map(render)}</>
}
