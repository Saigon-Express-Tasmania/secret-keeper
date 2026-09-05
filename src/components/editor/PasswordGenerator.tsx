import { useState } from "react"
import { WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const LOWER = "abcdefghijklmnopqrstuvwxyz"
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const DIGITS = "0123456789"
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?"

function generatePassword(length: number, useSymbols: boolean): string {
  const alphabet = LOWER + UPPER + DIGITS + (useSymbols ? SYMBOLS : "")
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ""
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]!
  }
  return out
}

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
        "flex flex-wrap items-end gap-3 rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/30",
        className
      )}
    >
      <div className="space-y-1">
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
      <label className="flex items-center gap-2 pb-1 text-xs font-medium text-amber-900 dark:text-amber-100">
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
        onClick={() => onGenerate(generatePassword(length, symbols))}
      >
        <WandSparkles />
        Generate
      </Button>
    </div>
  )
}
