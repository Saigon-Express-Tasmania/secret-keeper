import { useFinder } from "@/components/dashboard/finderContext"
import { FinderContent } from "@/components/dashboard/FinderContent"
import { FinderPathBar } from "@/components/dashboard/FinderPathBar"
import { FinderSidebar } from "@/components/dashboard/FinderSidebar"
import { FinderStatusBar } from "@/components/dashboard/FinderStatusBar"
import { FinderToolbar } from "@/components/dashboard/FinderToolbar"
import { ScopeBar } from "@/components/dashboard/ScopeBar"
import { TrashBar } from "@/components/dashboard/TrashBar"
import { MacWindow } from "@/components/mac/MacWindow"
import { TrafficLights } from "@/components/mac/TrafficLights"

/** The Finder window: sidebar, toolbar, content, path bar and status bar. */
export function FinderWindow() {
  const c = useFinder()
  const { mode } = c.model
  return (
    <MacWindow
      zoomed={c.prefs.zoomed}
      minimized={c.win.minimized}
      aria-label={`${c.vaultName} — ${c.model.title}`}
      className="h-full w-full"
    >
      <div className="absolute top-5 left-5 z-30 max-md:hidden">
        <TrafficLights
          active={c.win.active}
          dirty={mode === "file" && c.editor.dirty}
          zoomed={c.prefs.zoomed}
          labels={{ close: "Lock Vault", minimize: "Minimize", zoom: c.prefs.zoomed ? "Restore" : "Zoom" }}
          onClose={() => void c.requestLock()}
          onMinimize={() => c.win.setMinimized(true)}
          onZoom={() => c.setPrefs({ zoomed: !c.prefs.zoomed })}
        />
      </div>
      {c.win.drawerOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/25 md:hidden"
          onClick={() => c.win.setDrawerOpen(false)}
        />
      ) : null}
      <FinderSidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-mac-content">
        <FinderToolbar />
        {mode === "search" ? <ScopeBar /> : null}
        {mode === "trash" ? <TrashBar /> : null}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <FinderContent />
        </div>
        {c.prefs.pathBar && mode !== "file" ? (
          <div className="max-md:hidden">
            <FinderPathBar />
          </div>
        ) : null}
        {c.prefs.statusBar ? <FinderStatusBar /> : null}
      </div>
    </MacWindow>
  )
}
