import { useEffect, useRef } from "react"

import {
  COMMANDS,
  SHORTCUT_COMMANDS,
  type CommandSpec,
} from "@/components/dashboard/commands"
import {
  defaultTargets,
  isEnabled,
} from "@/components/dashboard/hooks/useFinderCommands"
import type { FinderController } from "@/components/dashboard/hooks/useFinderController"
import {
  isEditableTarget,
  isInOverlay,
  matchShortcut,
} from "@/lib/finder/shortcuts"

const BROWSER_DEFAULTS = new Set(["s", "d", "o", "[", "]"])

/**
 * Window-level shortcut handling. Views handle navigation keys themselves and
 * call preventDefault, so this only sees what they didn't consume.
 */
export function useGlobalShortcuts(c: FinderController) {
  const ref = useRef(c)
  useEffect(() => {
    ref.current = c
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing || (e.repeat && e.key === " ")) return
      if (isInOverlay(e.target)) return
      const ctl = ref.current
      if (ctl.win.minimized) return
      const editable = isEditableTarget(e.target)
      let matched = false
      for (const id of SHORTCUT_COMMANDS) {
        const spec: CommandSpec = COMMANDS[id]
        if (!spec.shortcuts?.some((s) => matchShortcut(e, s))) continue
        if (editable && !spec.allowInEditable) return
        matched = true
        const x = { c: ctl, items: defaultTargets(ctl) }
        if (!isEnabled(ctl, spec, x)) {
          // Same keys can mean different commands (⌘⌫ = Trash / Put Back).
          continue
        }
        e.preventDefault()
        void spec.run(x)
        return
      }
      // A disabled ⌘S/⌘D/⌘O/⌘[/⌘] must not fall through to the browser
      // (save page, bookmark, open file, history back/forward).
      if (matched && BROWSER_DEFAULTS.has(e.key.toLowerCase())) e.preventDefault()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
