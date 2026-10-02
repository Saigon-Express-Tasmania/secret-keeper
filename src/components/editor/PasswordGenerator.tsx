import { useState } from "react"
import { WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { generatePassword } from "@/lib/security/password"
import { cn } from "@/lib/utils"

type PasswordGeneratorProps = {
  onGenerate: (password: string) => void
  className?: string
}

export function PasswordGenerator({
  onGenerate,
  className,
}: PasswordGeneratorProps) {
  const [length, setLength] = useState(20)
  const [symbols, setSymbols] = useState(true)

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200/80 bg-amber-50/60 px-2.5 py-2 dark:border-amber-800 dark:bg-amber-950/30",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <label
          htmlFor="pw-len"
          className="text-xs font-medium text-amber-900 dark:text-amber-100"
        >
          Length
        </label>
        <Input
          id="pw-len"
          type="number"
          min={8}
          max={64}
          value={length}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10)
            if (Number.isFinite(n)) setLength(Math.min(64, Math.max(8, n)))
          }}
          className="h-8 w-20 bg-background"
        />
      </div>
      <label className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-100">
        <input
          type="checkbox"
          checked={symbols}
          onChange={(e) => setSymbols(e.target.checked)}
          className="size-3.5 rounded border"
        />
        Symbols
      </label>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="ml-auto"
        onClick={() => onGenerate(generatePassword(length, symbols))}
      >
        <WandSparkles />
        Generate
      </Button>
    </div>
  )
}
