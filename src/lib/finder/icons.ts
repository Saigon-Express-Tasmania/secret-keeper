import { isKnownIconId } from "@/lib/icons/catalog"
import { isExternalIconUrl } from "@/lib/icons/external"
import {
  DEFAULT_FILE_ICON,
  DEFAULT_FOLDER_ICON,
  resolveNodeIcon,
  type FsNode,
} from "@/lib/vault/fs"

/**
 * The node's custom (or seed-folder) icon id, or null when it only has the
 * default folder/document icon — then the plain Mac artwork is shown.
 */
export function customGlyphId(node: FsNode, name?: string): string | null {
  const id = resolveNodeIcon(node, name)
  if (id === DEFAULT_FOLDER_ICON || id === DEFAULT_FILE_ICON) return null
  return isKnownIconId(id) || isExternalIconUrl(id) ? id : null
}
