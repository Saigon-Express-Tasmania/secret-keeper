import { customGlyphId } from "@/lib/finder/icons"
import { childCount, nodeSizeBytes } from "@/lib/finder/items"
import { formatFinderSize, formatItemCount } from "@/lib/finder/format"
import type { FinderClipboard, FinderItem } from "@/lib/finder/types"

export function glyphFor(item: FinderItem): string | null {
  return item.source === "phantom" ? null : customGlyphId(item.node, item.name)
}

export function iconKind(item: FinderItem): "folder" | "file" {
  return item.kind === "dir" ? "folder" : "file"
}

/** List "Size" column: folders show "--" unless sizes are calculated. */
export function sizeText(item: FinderItem, calculate: boolean): string {
  if (item.source === "phantom") return "--"
  if (item.kind === "dir") return calculate ? formatFinderSize(nodeSizeBytes(item.node)) : "--"
  return formatFinderSize(nodeSizeBytes(item.node))
}

/** Icon view "item info" line for folders and (by default) files. */
export function infoText(item: FinderItem): string {
  if (item.source === "phantom") return ""
  if (item.kind === "dir") return formatItemCount(childCount(item.node))
  return formatFinderSize(nodeSizeBytes(item.node))
}

export function isCut(clipboard: FinderClipboard, item: FinderItem): boolean {
  return (
    item.source === "vault" &&
    clipboard?.mode === "cut" &&
    clipboard.paths.includes(item.path)
  )
}
