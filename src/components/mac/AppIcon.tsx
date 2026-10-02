import { LockKeyhole } from "lucide-react"

import { cn } from "@/lib/utils"

/** The app's own icon: a squircle with a padlock (no Apple artwork). */
export function AppIcon({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-linear-to-b from-[#5ac8fa] to-[#0a64d8] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_1px_3px_rgb(0_0_0/0.25)]",
        className
      )}
      style={{ width: size, height: size, borderRadius: size * 0.225 }}
    >
      <LockKeyhole style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2} />
    </span>
  )
}
