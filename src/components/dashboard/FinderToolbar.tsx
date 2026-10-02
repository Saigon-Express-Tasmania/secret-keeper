import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  CircleEllipsis,
  Columns3,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  PanelLeft,
} from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { MenuNodes } from "@/components/dashboard/menus/MenuNodes"
import { actionMenu, mobileMenu, sortMenu } from "@/components/dashboard/menus/model"
import { SearchField } from "@/components/mac/SearchField"
import { SegmentedControl } from "@/components/mac/SegmentedControl"
import { ToolbarButton, ToolbarGroup } from "@/components/mac/ToolbarButton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import type { ViewMode } from "@/lib/finder/types"
import { isEditableTarget } from "@/lib/finder/shortcuts"
import { cn } from "@/lib/utils"

/** Keep focus in a rename field if a menu closes while it is active. */
function keepEditingFocus(e: Event) {
  if (isEditableTarget(document.activeElement)) e.preventDefault()
}

/** Unified window toolbar: navigation, title, view controls, search. */
export function FinderToolbar() {
  const c = useFinder()
  const desktop = useMediaQuery("(min-width: 768px)")
  const { mode, view, title } = c.model
  const fileMode = mode === "file"
  const sidebarHidden = !c.prefs.sidebar
  const sortNode = sortMenu(c)

  return (
    <header
      className={cn(
        "flex h-[52px] shrink-0 items-center gap-1 border-b border-mac-separator bg-mac-toolbar px-2 select-none",
        sidebarHidden && "md:pl-[84px]"
      )}
      onDoubleClick={(e) => {
        if (desktop && (e.target as Element).closest("[data-drag-region]")) {
          c.setPrefs({ zoomed: !c.prefs.zoomed })
        }
      }}
      data-drag-region
    >
      <ToolbarButton
        label={desktop ? (sidebarHidden ? "Show Sidebar" : "Hide Sidebar") : "Show Sidebar"}
        icon={<PanelLeft />}
        onClick={() =>
          desktop ? c.setPrefs({ sidebar: !c.prefs.sidebar }) : c.win.setDrawerOpen(true)
        }
      />
      <ToolbarGroup>
        <ToolbarButton
          label="Back"
          icon={<ChevronLeft />}
          disabled={!c.model.canGoBack}
          onClick={() => void c.goBack()}
        />
        <ToolbarButton
          label="Forward"
          icon={<ChevronRight />}
          disabled={!c.model.canGoForward}
          onClick={() => void c.goForward()}
          className="max-sm:hidden"
        />
      </ToolbarGroup>
      <div className="flex min-w-0 flex-1 items-baseline gap-1 self-stretch px-1" data-drag-region>
        <h1 className="flex h-full min-w-0 items-center truncate text-[14px] font-bold text-mac-label" data-drag-region>
          <span className="truncate">{title}</span>
          {fileMode && c.editor.dirty ? (
            <span className="ml-1 shrink-0 font-normal text-mac-label-2">— Edited</span>
          ) : null}
        </h1>
      </div>
      {!fileMode ? (
        <SegmentedControl<ViewMode>
          aria-label="View"
          iconOnly
          value={view}
          onValueChange={(next) => c.setPrefs({ view: next })}
          className="mr-1 max-sm:hidden"
          items={[
            { value: "icons", label: "Icons", icon: <LayoutGrid /> },
            { value: "list", label: "List", icon: <List /> },
            {
              value: "columns",
              label: "Columns",
              icon: <Columns3 />,
              disabled: mode === "search" || mode === "trash",
            },
          ]}
        />
      ) : null}
      {!fileMode && sortNode.type === "sub" ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <ToolbarButton label="Sort By" icon={<ArrowUpDown />} className="max-sm:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={keepEditingFocus}>
            <MenuNodes nodes={sortNode.children} flavor="dropdown" />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton label="Action" icon={<CircleEllipsis />} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={keepEditingFocus}>
          <MenuNodes nodes={desktop ? actionMenu(c) : mobileMenu(c)} flavor="dropdown" />
        </DropdownMenuContent>
      </DropdownMenu>
      {mode === "folder" || mode === "search" ? (
        <ToolbarButton
          label={c.showCredentials ? "Hide Credentials" : "Show Credentials"}
          icon={c.showCredentials ? <Eye /> : <EyeOff />}
          pressed={c.showCredentials}
          onClick={() => c.setShowCredentials(!c.showCredentials)}
        />
      ) : null}
      {mode !== "trash" ? (
        <SearchField
          inputRef={c.searchRef}
          value={c.state.search.query}
          onChange={(q) => void c.setQuery(q)}
          onEscape={() => {
            void c.setQuery("")
            c.focusContent()
          }}
          className="ml-1 w-32 shrink-0 transition-[width] duration-200 sm:w-40 md:w-44 md:focus-within:w-56"
        />
      ) : null}
    </header>
  )
}
