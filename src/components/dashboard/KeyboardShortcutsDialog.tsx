import { useFinder } from "@/components/dashboard/finderContext"
import { COMMANDS, type CommandId, type CommandSpec } from "@/components/dashboard/commands"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatShortcut, IS_MAC, primaryShortcut } from "@/lib/finder/shortcuts"

const SECTIONS: [string, CommandId[]][] = [
  ["File", ["file.newFolder", "file.newAccount", "file.open", "file.rename", "file.quickLook", "file.getInfo", "file.duplicate", "file.moveToTrash", "file.deleteImmediately", "file.emptyTrash", "file.find", "file.save"]],
  ["Edit", ["edit.cut", "edit.copy", "edit.paste", "edit.selectAll"]],
  ["View", ["view.icons", "view.list", "view.columns", "view.showCredentials", "view.sidebar", "view.pathBar", "view.statusBar"]],
  ["Go", ["go.back", "go.forward", "go.enclosing", "go.vault"]],
]

/** Help ▸ Keyboard Shortcuts, generated from the command registry. */
export function KeyboardShortcutsDialog() {
  const c = useFinder()
  return (
    <Dialog open={c.dialogs.shortcutsOpen} onOpenChange={c.dialogs.setShortcutsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Keyboard Shortcuts</DialogTitle>
        <DialogDescription>
          {IS_MAC
            ? "Finder shortcuts work here too; a few that the browser reserves use ⌥ instead."
            : "Finder shortcuts, with Ctrl in place of ⌘."}
        </DialogDescription>
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map(([title, ids]) => (
            <section key={title}>
              <h3 className="mb-1 text-[11px] font-semibold text-mac-label-2">{title}</h3>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[12px]">
                {ids.map((id) => {
                  const spec: CommandSpec = COMMANDS[id]
                  const sc = primaryShortcut(spec.shortcuts)
                  if (!sc) return null
                  const label =
                    typeof spec.label === "string" ? spec.label : spec.label({ c, items: [] })
                  return (
                    <div key={id} className="contents">
                      <dt className="truncate text-mac-label">{label.replace(/ “.*”$/, "")}</dt>
                      <dd className="text-right font-mono text-mac-label-2">{formatShortcut(sc)}</dd>
                    </div>
                  )
                })}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
