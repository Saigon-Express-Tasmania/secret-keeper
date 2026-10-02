import { useCallback } from "react"

import {
  COMMANDS,
  type CmdCtx,
  type CommandId,
  type CommandSpec,
} from "@/components/dashboard/commands"
import type { FinderController } from "@/components/dashboard/hooks/useFinderController"
import { formatShortcut, primaryShortcut } from "@/lib/finder/shortcuts"
import type { FinderItem } from "@/lib/finder/types"

export type ResolvedCommand = {
  id: CommandId
  label: string
  shortcut?: string
  enabled: boolean
  checked?: boolean
  run: () => void
}

/** Default targets: the selection, or the open file in file mode. */
export function defaultTargets(c: FinderController): FinderItem[] {
  if (c.model.mode === "file" && c.model.fileItem) return [c.model.fileItem]
  return c.model.selectedItems
}

export function isEnabled(c: FinderController, spec: CommandSpec, x: CmdCtx): boolean {
  if (spec.mutates && c.busy) return false
  return spec.enabled ? spec.enabled(x) : true
}

export function resolveCommand(
  c: FinderController,
  id: CommandId,
  items?: FinderItem[]
): ResolvedCommand {
  const spec: CommandSpec = COMMANDS[id]
  const x: CmdCtx = { c, items: items ?? defaultTargets(c) }
  const enabled = isEnabled(c, spec, x)
  const sc = primaryShortcut(spec.shortcuts)
  return {
    id,
    label: typeof spec.label === "function" ? spec.label(x) : spec.label,
    shortcut: sc ? formatShortcut(sc) : undefined,
    enabled,
    checked: spec.checked ? spec.checked(x) : undefined,
    run: () => {
      if (enabled) void spec.run(x)
    },
  }
}

/** Stable accessor used by menus, toolbars and views. */
export function useCommandResolver(c: FinderController) {
  return useCallback(
    (id: CommandId, items?: FinderItem[]) => resolveCommand(c, id, items),
    [c]
  )
}
