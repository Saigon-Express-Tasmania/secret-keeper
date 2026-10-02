import type { ReactNode } from "react"

import type { FinderItem, SortKey } from "@/lib/finder/types"

export const NAME_MIN = 200

export type ListColumn = {
  id: string
  label: string
  width: number
  /** Lower = kept longer when the window narrows (Name is always kept). */
  priority: number
  sort?: SortKey
  align?: "right"
  render: (item: FinderItem, ctx: { selected: boolean; emphasized: boolean }) => ReactNode
}

/** Drop the least important columns until everything fits beside Name. */
export function fitColumns(cols: ListColumn[], width: number): ListColumn[] {
  const kept = [...cols]
  const budget = Math.max(0, width - 20 - NAME_MIN)
  const total = () => kept.reduce((sum, col) => sum + col.width, 0)
  while (kept.length > 0 && total() > budget) {
    let worst = 0
    for (let i = 1; i < kept.length; i++) {
      if (kept[i]!.priority >= kept[worst]!.priority) worst = i
    }
    kept.splice(worst, 1)
  }
  return kept
}

