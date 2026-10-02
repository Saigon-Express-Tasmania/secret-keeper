import { Loader2, Lock, TriangleAlert } from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { StatusBar } from "@/components/mac/StatusBar"
import { Slider } from "@/components/ui/slider"
import { formatItemCount } from "@/lib/finder/format"
import { ICON_SIZE_MAX, ICON_SIZE_MIN } from "@/lib/prefs/finderPrefs"

/** Item counts, save status and the icon-size slider. */
export function FinderStatusBar() {
  const c = useFinder()
  const { mode, items, selectedItems, view } = c.model

  const left = c.busy ? (
    <>
      <Loader2 className="size-3 shrink-0 animate-spin" />
      <span className="truncate">{c.win.lockPending ? "Locking after save…" : "Saving…"}</span>
    </>
  ) : c.saveError ? (
    <button
      type="button"
      className="flex min-w-0 items-center gap-1 text-mac-red"
      onClick={() => void c.alerts.alert({ title: "The vault couldn’t be saved.", message: c.saveError ?? undefined })}
    >
      <TriangleAlert className="size-3 shrink-0" />
      <span className="truncate">Couldn’t save</span>
    </button>
  ) : null

  let center: string
  if (mode === "file") center = "Decrypted while open"
  else if (selectedItems.length > 0) center = `${selectedItems.length} of ${items.length} selected`
  else center = formatItemCount(items.filter((i) => i.source !== "phantom").length)

  return (
    <StatusBar
      left={left}
      center={
        mode === "file" ? (
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3" />
            {center}
          </span>
        ) : (
          center
        )
      }
      right={
        view === "icons" && mode !== "file" ? (
          <Slider
            className="w-24"
            min={ICON_SIZE_MIN}
            max={ICON_SIZE_MAX}
            step={8}
            value={[c.prefs.iconSize]}
            onValueChange={([v]) => v !== undefined && c.setPrefs({ iconSize: v })}
          />
        ) : null
      }
    />
  )
}
