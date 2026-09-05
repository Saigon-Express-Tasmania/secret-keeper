import { useState, type ReactNode } from "react"
import { Eye, EyeOff } from "lucide-react"

import { CopyButton } from "@/components/editor/CopyButton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type SecretFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  className?: string
  trailing?: ReactNode
}

export function SecretField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "off",
  className,
  trailing,
}: SecretFieldProps) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="font-mono"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
        <CopyButton value={value} size="icon" label="Copy" />
        {trailing}
      </div>
    </div>
  )
}
