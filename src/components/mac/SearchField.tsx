import type { Ref } from "react"
import { CircleX, Search } from "lucide-react"

import { cn } from "@/lib/utils"

type SearchFieldProps = {
  value: string
  onChange: (value: string) => void
  onEscape?: () => void
  inputRef?: Ref<HTMLInputElement>
  placeholder?: string
  className?: string
  "aria-label"?: string
}

/** Rounded toolbar search field with magnifier and clear button. */
export function SearchField({
  value,
  onChange,
  onEscape,
  inputRef,
  placeholder = "Search",
  className,
  "aria-label": ariaLabel = "Search",
}: SearchFieldProps) {
  return (
    <div
      className={cn(
        "relative flex h-7 items-center rounded-[7px] bg-black/[0.05] text-mac-label transition-[box-shadow,background-color] focus-within:bg-mac-field focus-within:ring-[3px] focus-within:ring-mac-focus dark:bg-white/[0.08] pointer-coarse:h-9",
        className
      )}
    >
      <Search className="pointer-events-none absolute left-2 size-3.5 text-mac-label-2" strokeWidth={2} />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onEscape?.()
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        className="h-full w-full min-w-0 bg-transparent pr-7 pl-7 text-base outline-none placeholder:text-mac-label-2 md:text-[13px] [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-1.5 flex size-4 items-center justify-center text-mac-label-3 hover:text-mac-label-2"
        >
          <CircleX className="size-3.5 fill-current stroke-mac-content" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}
