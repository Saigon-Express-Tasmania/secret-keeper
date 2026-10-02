import { useCallback, useState, type DragEvent } from "react"

import { acceptDrag, performDrop, type DropDest } from "@/components/dashboard/dnd"
import type { FinderController } from "@/components/dashboard/hooks/useFinderController"

/** Drop-target props + hover state for fixed targets (sidebar, path bar). */
export function useDropHover(c: FinderController) {
  const [hover, setHover] = useState<string | null>(null)
  const propsFor = useCallback(
    (key: string, dest: DropDest) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (acceptDrag(c, dest, e)) setHover(key)
        else setHover((h) => (h === key ? null : h))
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setHover((h) => (h === key ? null : h))
        }
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        setHover(null)
        performDrop(c, dest, e)
      },
    }),
    [c]
  )
  return { hover, propsFor }
}
