import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export type SectionTone = "sky" | "amber" | "emerald" | "violet" | "rose"

const TONE_STYLES: Record<
  SectionTone,
  { border: string; header: string; body: string; chevron: string }
> = {
  sky: {
    border: "border-sky-200 dark:border-sky-800",
    header:
      "bg-sky-50 text-sky-950 hover:bg-sky-100/80 dark:bg-sky-950/40 dark:text-sky-50 dark:hover:bg-sky-950/60",
    body: "border-t border-sky-100 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/20",
    chevron: "text-sky-600 dark:text-sky-400",
  },
  amber: {
    border: "border-amber-200 dark:border-amber-800",
    header:
      "bg-amber-50 text-amber-950 hover:bg-amber-100/80 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-950/60",
    body: "border-t border-amber-100 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20",
    chevron: "text-amber-600 dark:text-amber-400",
  },
  emerald: {
    border: "border-emerald-200 dark:border-emerald-800",
    header:
      "bg-emerald-50 text-emerald-950 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:text-emerald-50 dark:hover:bg-emerald-950/60",
    body: "border-t border-emerald-100 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20",
    chevron: "text-emerald-600 dark:text-emerald-400",
  },
  violet: {
    border: "border-violet-200 dark:border-violet-800",
    header:
      "bg-violet-50 text-violet-950 hover:bg-violet-100/80 dark:bg-violet-950/40 dark:text-violet-50 dark:hover:bg-violet-950/60",
    body: "border-t border-violet-100 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/20",
    chevron: "text-violet-600 dark:text-violet-400",
  },
  rose: {
    border: "border-rose-200 dark:border-rose-800",
    header:
      "bg-rose-50 text-rose-950 hover:bg-rose-100/80 dark:bg-rose-950/40 dark:text-rose-50 dark:hover:bg-rose-950/60",
    body: "border-t border-rose-100 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20",
    chevron: "text-rose-600 dark:text-rose-400",
  },
}

const ACCENT_BAR: Record<SectionTone, string> = {
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
}

type EditorSectionProps = {
  title: string
  description?: string
  tone: SectionTone
  defaultOpen?: boolean
  children: ReactNode
}

export function EditorSection({
  title,
  description,
  tone,
  defaultOpen = true,
  children,
}: EditorSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const styles = TONE_STYLES[tone]

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "overflow-hidden rounded-xl border shadow-sm",
          styles.border
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
              styles.header
            )}
          >
            <span
              className={cn("h-8 w-1 shrink-0 rounded-full", ACCENT_BAR[tone])}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold tracking-tight">
                {title}
              </span>
              {description ? (
                <span className="mt-0.5 block text-xs opacity-70">
                  {description}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 transition-transform duration-200",
                styles.chevron,
                open ? "rotate-0" : "-rotate-90"
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn("space-y-4 px-4 py-4", styles.body)}>
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
