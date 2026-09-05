import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

import { CopyButton } from "@/components/editor/CopyButton"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SecretCellProps = {
  value: string
  /** Masked placeholder when hidden (default bullets). */
  maskedPlaceholder?: string
  className?: string
  /** Extra class on the value text. */
  valueClassName?: string
}

/**
 * Compact list-cell secret: masked by default, Eye reveal + Copy.
 * Clicks stopPropagation so the parent row does not open the file.
 */
export function SecretCell({
  value,
  maskedPlaceholder = "••••••••",
  className,
  valueClassName,
}: SecretCellProps) {
  const [revealed, setRevealed] = useState(false)

  if (!value) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    )
  }

  return (
    <div
      className={cn("flex min-w-0 items-center gap-0.5", className)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-xs tabular-nums",
          valueClassName
        )}
      >
        {revealed ? value : maskedPlaceholder}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          setRevealed((v) => !v)
        }}
        aria-label={revealed ? "Hide" : "Reveal"}
      >
        {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>
      <CopyButton
        value={value}
        size="icon"
        variant="ghost"
        label="Copy"
        className="size-7 shrink-0"
      />
    </div>
  )
}

type UsernameCellProps = {
  value: string
  className?: string
}

/** Plaintext username with copy; empty shows em dash. */
export function UsernameCell({ value, className }: UsernameCellProps) {
  if (!value) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    )
  }

  return (
    <div
      className={cn("flex min-w-0 items-center gap-0.5", className)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="min-w-0 flex-1 truncate text-xs">{value}</span>
      <CopyButton
        value={value}
        size="icon"
        variant="ghost"
        label="Copy"
        className="size-7 shrink-0"
      />
    </div>
  )
}
