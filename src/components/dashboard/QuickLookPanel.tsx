import { X } from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { ItemPreview } from "@/components/dashboard/ItemPreview"
import { Button } from "@/components/ui/button"

/**
 * Quick Look: a floating, non-modal preview of the focused item. Keyboard
 * focus stays in the Finder view, so arrow keys move the selection and the
 * panel follows; Space or Escape closes it.
 */
export function QuickLookPanel() {
  const c = useFinder()
  const focus = c.state.selection.focus
  const item = focus ? c.model.itemsByKey.get(focus) : undefined
  if (!c.state.quickLook || !item || item.source === "phantom" || c.win.minimized) return null

  const close = () => c.dispatch({ type: "quickLook", open: false })
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Quick Look: ${item.name}`}
      className="fixed top-1/2 left-1/2 z-40 flex max-h-[min(36rem,calc(100svh-4rem))] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-mac-menu text-mac-label shadow-mac-window backdrop-blur-2xl backdrop-saturate-150 animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-mac-separator px-2">
        <button
          type="button"
          onClick={close}
          aria-label="Close Quick Look"
          className="flex size-6 items-center justify-center rounded-full text-mac-label-2 hover:bg-mac-hover hover:text-mac-label"
        >
          <X className="size-3.5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[13px] font-semibold">{item.name}</span>
        {item.source === "vault" ? (
          <Button size="sm" variant="outline" onClick={() => void c.openItem(item)}>
            Open
          </Button>
        ) : (
          <span className="w-6" />
        )}
      </div>
      <div className="overflow-y-auto p-5">
        <ItemPreview item={item} variant="quicklook" />
      </div>
    </div>
  )
}
