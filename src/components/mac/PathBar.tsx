import { Fragment, type ComponentProps, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

export type PathBarSegment = {
  key: string
  label: string
  icon: ReactNode
  onActivate?: () => void
  /** Extra props (drag-and-drop handlers, data attributes). */
  props?: Omit<ComponentProps<"button">, "children" | "onClick">
  dropTarget?: boolean
}

/** Finder path bar: clickable location segments separated by chevrons. */
export function PathBar({ segments }: { segments: PathBarSegment[] }) {
  return (
    <nav
      aria-label="Path"
      className="flex h-6 shrink-0 items-center overflow-hidden border-t border-mac-separator bg-mac-content px-2 text-[11px] text-mac-label-2"
    >
      {segments.map((seg, i) => {
        const last = i === segments.length - 1
        return (
          <Fragment key={seg.key}>
            {i > 0 ? (
              <ChevronRight className="mx-0.5 size-2.5 shrink-0 text-mac-label-3" strokeWidth={2.5} aria-hidden />
            ) : null}
            <button
              type="button"
              onClick={seg.onActivate}
              aria-current={last ? "location" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              className={cn(
                "flex h-5 min-w-0 items-center gap-1 rounded-[4px] px-1 outline-none select-none hover:bg-mac-hover focus-visible:ring-2 focus-visible:ring-mac-focus",
                last ? "shrink-0 text-mac-label" : "shrink",
                seg.dropTarget && "bg-mac-accent text-white"
              )}
              {...seg.props}
            >
              <span className="flex shrink-0 items-center [&_svg]:size-3.5">{seg.icon}</span>
              <span className="truncate">{seg.label}</span>
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}
