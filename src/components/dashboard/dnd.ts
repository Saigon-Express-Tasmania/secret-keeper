import type { DragEvent } from "react"

import type { FinderController } from "@/components/dashboard/hooks/useFinderController"
import { DRAG_MIME, dragSession, dropModeFor, isFinderDrag } from "@/lib/finder/dnd"
import { checkTransfer, isNoopMove } from "@/lib/finder/paths"

/** Where a drop lands: a vault folder path, or the Trash. */
export type DropDest = string | { trash: true }

export type DropOutcome = "move" | "copy" | "trash"

/** What dropping the current drag on `dest` would do, or null if not allowed. */
export function dropOutcome(
  c: FinderController,
  dest: DropDest,
  e: { altKey: boolean; ctrlKey: boolean }
): DropOutcome | null {
  const paths = dragSession.paths
  if (!paths || paths.length === 0 || c.busy) return null
  if (typeof dest !== "string") return "trash"
  if (checkTransfer(paths, dest)) return null
  const mode = dropModeFor(e)
  if (mode === "move" && isNoopMove(paths, dest)) return null
  return mode
}

export function acceptDrag(
  c: FinderController,
  dest: DropDest,
  e: DragEvent
): DropOutcome | null {
  if (!isFinderDrag(e)) return null
  const outcome = dropOutcome(c, dest, e)
  if (!outcome) {
    e.dataTransfer.dropEffect = "none"
    return null
  }
  e.preventDefault()
  e.dataTransfer.dropEffect = outcome === "copy" ? "copy" : "move"
  return outcome
}

export function performDrop(c: FinderController, dest: DropDest, e: DragEvent) {
  const outcome = acceptDrag(c, dest, e)
  const paths = dragSession.paths
  dragSession.paths = null
  if (!outcome || !paths) return
  if (outcome === "trash") void c.trashPaths(paths)
  else if (outcome === "copy" && typeof dest === "string") void c.copyItems(paths, dest)
  else if (typeof dest === "string") void c.moveItems(paths, dest)
}

/** Start a Finder drag; multi-item drags get a count badge as drag image. */
export function beginDrag(e: DragEvent, paths: string[]) {
  dragSession.paths = paths
  e.dataTransfer.setData(DRAG_MIME, String(paths.length))
  e.dataTransfer.effectAllowed = "copyMove"
  if (paths.length > 1) {
    const badge = document.createElement("div")
    badge.textContent = String(paths.length)
    badge.style.cssText =
      "position:fixed;top:-100px;left:-100px;min-width:22px;height:22px;padding:0 7px;border-radius:11px;background:#ff3b30;color:#fff;font:600 13px/22px -apple-system,BlinkMacSystemFont,sans-serif;text-align:center;box-shadow:0 1px 3px rgb(0 0 0/.3)"
    document.body.appendChild(badge)
    e.dataTransfer.setDragImage(badge, 11, 11)
    window.setTimeout(() => badge.remove(), 0)
  }
}

export function endDrag() {
  dragSession.paths = null
}
