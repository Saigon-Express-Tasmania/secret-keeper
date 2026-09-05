import { useCallback, useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CopyButtonProps = {
  value: string
  label?: string
  className?: string
  size?: "sm" | "icon" | "default"
  variant?: "outline" | "ghost" | "secondary"
  disabled?: boolean
}

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
  variant = "outline",
  disabled,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be blocked; ignore
    }
  }, [value])

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn(className)}
      onClick={() => void handleCopy()}
      disabled={disabled || !value}
    >
      {copied ? <Check /> : <Copy />}
      {size !== "icon" ? (copied ? "Copied" : label) : null}
    </Button>
  )
}
