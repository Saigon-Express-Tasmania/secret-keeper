import { useState, type ReactNode } from "react"
import { ChevronRight, type LucideIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export type SectionTone = "sky" | "amber" | "emerald" | "violet" | "rose"

/** System Settings–style badge colours per section tone. */
const BADGE: Record<SectionTone, string> = {
  sky: "bg-mac-blue",
  amber: "bg-mac-orange",
  emerald: "bg-mac-green",
  violet: "bg-mac-purple",
  rose: "bg-mac-pink",
}

type EditorSectionProps = {
  title: string
  description?: string
  tone: SectionTone
  icon?: LucideIcon
  defaultOpen?: boolean
  children: ReactNode
}

/** Grouped, collapsible form section in the style of macOS System Settings. */
export function EditorSection({
  title,
  description,
  tone,
  icon: Icon,
  defaultOpen = true,
  children,
}: EditorSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="overflow-hidden rounded-[10px] bg-mac-group shadow-[0_0_0_0.5px_var(--mac-separator),0_0.5px_2px_rgb(0_0_0/0.05)]">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors outline-none select-none hover:bg-mac-hover focus-visible:bg-mac-hover"
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-[6px] text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.3),0_0.5px_1px_rgb(0_0_0/0.2)]",
                BADGE[tone]
              )}
              aria-hidden
            >
              {Icon ? <Icon className="size-3.5" strokeWidth={2.25} /> : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] leading-tight font-semibold text-mac-label">
                {title}
              </span>
              {description ? (
                <span className="truncate text-[11px] leading-tight text-mac-label-2">
                  {description}
                </span>
              ) : null}
            </span>
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-mac-label-3 transition-transform duration-200",
                open && "rotate-90"
              )}
              strokeWidth={2.25}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="@container space-y-3 border-t border-mac-separator px-3 py-3">
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
