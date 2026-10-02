import { useRef, useState, type PointerEvent } from "react"
import { HardDrive, Trash2 } from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { useDropHover } from "@/components/dashboard/hooks/useDropHover"
import { MenuNodes } from "@/components/dashboard/menus/MenuNodes"
import { sidebarMenu, type MenuNode } from "@/components/dashboard/menus/model"
import { sidebarSymbolFor } from "@/components/icons/sidebarSymbols"
import { SidebarItem, SidebarSection } from "@/components/mac/Sidebar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { rootFolderItems } from "@/lib/finder/items"
import { SIDEBAR_MAX, SIDEBAR_MIN } from "@/lib/prefs/finderPrefs"
import { cn } from "@/lib/utils"

/** Favorites (vault root + top-level folders) and Locations (Trash). */
export function FinderSidebar() {
  const c = useFinder()
  const roots = rootFolderItems(c.archive)
  const { mode, path } = c.model
  const trashCount = c.archive.recycleBin?.length ?? 0
  const clip = c.state.clipboard
  const [target, setTarget] = useState<string | null>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const drag = useRef<{ x: number; w: number } | null>(null)
  const width = dragWidth ?? c.prefs.sidebarWidth
  const drop = useDropHover(c)

  const browsingHere = (p: string) => mode === "folder" && path === p

  let nodes: MenuNode[] = []
  if (target === "trash") {
    nodes = [
      { type: "action", key: "open", label: "Open", onSelect: () => void c.navigate({ kind: "trash" }) },
      { type: "sep" },
      { type: "cmd", id: "file.emptyTrash" },
    ]
  } else if (target === "") {
    nodes = [
      { type: "action", key: "open", label: "Open", onSelect: () => void c.navigate({ kind: "path", path: "" }) },
    ]
  } else if (target) {
    const item = roots.find((r) => r.key === target)
    if (item) nodes = sidebarMenu(c, item)
  }

  function onResizeDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: width }
  }
  function onResizeMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const next = drag.current.w + e.clientX - drag.current.x
    setDragWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(next))))
  }
  function onResizeUp() {
    if (drag.current && dragWidth !== null) c.setPrefs({ sidebarWidth: dragWidth })
    drag.current = null
    setDragWidth(null)
  }

  return (
    <aside
      aria-label="Sidebar"
      data-open={c.win.drawerOpen || undefined}
      className={cn(
        "relative flex shrink-0 flex-col border-r border-mac-separator bg-mac-sidebar backdrop-blur-2xl backdrop-saturate-150",
        "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-72! max-md:-translate-x-full max-md:bg-mac-content max-md:shadow-2xl max-md:transition-transform max-md:data-open:translate-x-0",
        !c.prefs.sidebar && "md:hidden"
      )}
      style={{ width }}
    >
      <div className="h-[52px] shrink-0 max-md:h-4" />
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <nav
            className="min-h-0 flex-1 overflow-y-auto pb-3"
            onContextMenu={(e) => {
              const el = (e.target as Element).closest<HTMLElement>("[data-sidebar-key]")
              setTarget(el ? (el.dataset.sidebarKey ?? null) : null)
            }}
          >
            <SidebarSection title="Favorites">
              <SidebarItem
                data-sidebar-key=""
                icon={<HardDrive />}
                label={c.vaultName}
                active={browsingHere("")}
                dropTarget={drop.hover === "root"}
                {...drop.propsFor("root", "")}
                onClick={() => void c.navigate({ kind: "path", path: "" })}
              />
              {roots.map((item) => {
                const Symbol = sidebarSymbolFor(item.node, item.name)
                return (
                  <SidebarItem
                    key={item.key}
                    data-sidebar-key={item.key}
                    icon={<Symbol />}
                    label={item.name}
                    active={browsingHere(item.path)}
                    dimmed={clip?.mode === "cut" && clip.paths.includes(item.path)}
                    dropTarget={drop.hover === item.key}
                    {...drop.propsFor(item.key, item.path)}
                    onClick={() => void c.navigate({ kind: "path", path: item.path })}
                  />
                )
              })}
            </SidebarSection>
            <SidebarSection title="Locations">
              <SidebarItem
                data-sidebar-key="trash"
                icon={<Trash2 />}
                label="Trash"
                active={mode === "trash"}
                badge={trashCount > 0 ? trashCount : null}
                dropTarget={drop.hover === "trash"}
                {...drop.propsFor("trash", { trash: true })}
                onClick={() => void c.navigate({ kind: "trash" })}
              />
            </SidebarSection>
          </nav>
        </ContextMenuTrigger>
        {nodes.length > 0 ? (
          <ContextMenuContent>
            <MenuNodes nodes={nodes} flavor="context" />
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize max-md:hidden"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
      />
    </aside>
  )
}
