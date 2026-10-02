import { HardDrive, Trash2 } from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { glyphFor } from "@/components/dashboard/views/itemDisplay"
import { FinderIcon } from "@/components/icons/FinderIcon"
import { PathBar, type PathBarSegment } from "@/components/mac/PathBar"
import { safeGetNode, vaultItem } from "@/lib/finder/items"
import { splitPath } from "@/lib/vault/fs"

/** Path of the single selected item, else of the current folder / file. */
export function FinderPathBar() {
  const c = useFinder()
  const { mode, selectedItems, path } = c.model

  if (mode === "trash") {
    return (
      <PathBar
        segments={[{ key: "trash", label: "Trash", icon: <Trash2 className="text-mac-label-2" /> }]}
      />
    )
  }

  const selected = selectedItems.length === 1 && selectedItems[0]!.source === "vault" ? selectedItems[0]! : null
  const shown = selected ? selected.path : mode === "search" ? c.state.search.scopeDir : path
  const parts = splitPath(shown)
  const segments: PathBarSegment[] = [
    {
      key: "",
      label: c.vaultName,
      icon: <HardDrive className="text-mac-label-2" />,
      onActivate: () => void c.navigate({ kind: "path", path: "" }),
    },
  ]
  for (let i = 0; i < parts.length; i++) {
    const p = parts.slice(0, i + 1).join("/")
    const node = safeGetNode(c.archive, p)
    if (!node) break
    const item = vaultItem(p, node)
    segments.push({
      key: p,
      label: item.name,
      icon: <FinderIcon kind={node.type === "dir" ? "folder" : "file"} glyphId={glyphFor(item)} size={14} />,
      onActivate: () => void c.navigate({ kind: "path", path: p }),
    })
  }
  return <PathBar segments={segments} />
}
