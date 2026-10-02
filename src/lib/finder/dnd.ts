import { IS_MAC } from "@/lib/finder/shortcuts"

/**
 * Drag payload type for Finder items. The data itself is only a marker: the
 * dragged paths live in `dragSession` so no vault names end up in the OS
 * drag pasteboard (and browsers hide drag data during dragover anyway).
 */
export const DRAG_MIME = "application/x-ck-items"

export const dragSession: { paths: string[] | null } = { paths: null }

export function isFinderDrag(e: { dataTransfer: DataTransfer | null }): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(DRAG_MIME)
}

/** ⌥ (macOS) / Ctrl (elsewhere) while dropping copies instead of moving. */
export function dropModeFor(e: { altKey: boolean; ctrlKey: boolean }): "move" | "copy" {
  return (IS_MAC ? e.altKey : e.ctrlKey) ? "copy" : "move"
}
