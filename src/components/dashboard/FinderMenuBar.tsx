import { Loader2, LockKeyhole } from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { MenuNodes } from "@/components/dashboard/menus/MenuNodes"
import {
  appMenu,
  editMenu,
  fileMenu,
  goMenu,
  helpMenu,
  viewMenu,
  windowMenu,
  type MenuNode,
} from "@/components/dashboard/menus/model"
import { MenuBarClock } from "@/components/mac/MenuBarClock"
import {
  Menubar,
  MenubarContent,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar"
import { isEditableTarget } from "@/lib/finder/shortcuts"

function keepEditingFocus(e: Event) {
  if (isEditableTarget(document.activeElement)) e.preventDefault()
}

/** macOS-style top menu bar (desktop widths only). */
export function FinderMenuBar() {
  const c = useFinder()
  const menus: [string, MenuNode[], boolean?][] = [
    ["Keep", appMenu(), true],
    ["File", fileMenu(c)],
    ["Edit", editMenu()],
    ["View", viewMenu(c)],
    ["Go", goMenu(c)],
    ["Window", windowMenu()],
    ["Help", helpMenu()],
  ]
  return (
    <div className="relative z-40 hidden h-6 shrink-0 items-center bg-mac-menubar pr-1 pl-3 text-[13px] text-mac-label shadow-[0_0.5px_0_rgb(0_0_0/0.12)] backdrop-blur-2xl backdrop-saturate-150 select-none md:flex">
      <LockKeyhole className="mr-1.5 size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
      <Menubar aria-label="Menu bar">
        {menus.map(([label, nodes, bold]) => (
          <MenubarMenu key={label}>
            <MenubarTrigger className={bold ? "font-bold" : undefined}>{label}</MenubarTrigger>
            <MenubarContent onCloseAutoFocus={keepEditingFocus}>
              <MenuNodes nodes={nodes} flavor="menubar" />
            </MenubarContent>
          </MenubarMenu>
        ))}
      </Menubar>
      <div className="ml-auto flex items-center gap-1">
        {c.busy ? (
          <span className="flex items-center gap-1 px-1.5 text-[12px] text-mac-label-2" role="status">
            <Loader2 className="size-3 animate-spin" />
            Saving…
          </span>
        ) : null}
        <button
          type="button"
          title="Lock Vault"
          aria-label="Lock Vault"
          onClick={() => void c.requestLock()}
          className="flex h-[22px] items-center rounded-[4px] px-2 outline-none hover:bg-black/10 focus-visible:bg-black/10 dark:hover:bg-white/15"
        >
          <LockKeyhole className="size-3.5" strokeWidth={2} />
        </button>
        <MenuBarClock />
      </div>
    </div>
  )
}
