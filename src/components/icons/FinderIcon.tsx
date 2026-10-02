import { useId } from "react"

import { NodeIcon } from "@/components/icons/NodeIcon"
import { cn } from "@/lib/utils"

type FinderIconProps = {
  kind: "folder" | "file"
  /** Custom icon drawn on the folder / page (see `customGlyphId`). */
  glyphId?: string | null
  size: number
  className?: string
}

/** IconPark glyphs draw black strokes; give them a light chip in Dark Mode. */
function needsBacking(id: string): boolean {
  return id.startsWith("icon-park:")
}

/**
 * Finder-style icon: a blue folder or a white document page (our own
 * artwork), with the item's custom icon overlaid like a macOS folder symbol.
 * At small sizes a custom icon is shown on its own.
 */
export function FinderIcon({ kind, glyphId, size, className }: FinderIconProps) {
  const uid = useId().replace(/:/g, "")

  if (glyphId && size <= 20) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          needsBacking(glyphId) && "rounded-[3px] dark:bg-white/85",
          className
        )}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <NodeIcon iconId={glyphId} kind={kind} size={size - (needsBacking(glyphId) ? 2 : 0)} />
      </span>
    )
  }

  const glyphSize = Math.round(size * (kind === "folder" ? 0.4 : 0.42))
  const glyphCenter = kind === "folder" ? { x: 32, y: 37.5 } : { x: 31.5, y: 32 }

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {kind === "folder" ? (
        <svg
          viewBox="0 0 64 64"
          width={size}
          height={size}
          className="drop-shadow-[0_0.5px_0.75px_rgb(0_0_0/0.22)]"
        >
          <defs>
            <linearGradient id={`ff${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--mac-folder-front)" />
              <stop offset="1" stopColor="var(--mac-folder-front-2)" />
            </linearGradient>
          </defs>
          <path
            d="M6 12.5C6 10.6 7.6 9 9.5 9h13.7c1.1 0 2.1.5 2.8 1.3l2.2 2.7h26.3c1.9 0 3.5 1.6 3.5 3.5V50c0 1.9-1.6 3.5-3.5 3.5h-45C7.6 53.5 6 51.9 6 50z"
            fill="var(--mac-folder-back)"
          />
          <rect x="9" y="15.5" width="46" height="9" rx="1.5" fill="#fff" opacity="0.9" />
          <rect x="6" y="19" width="52" height="34.5" rx="3.5" fill={`url(#ff${uid})`} />
          <rect x="6.6" y="19.1" width="50.8" height="1.1" rx="0.55" fill="var(--mac-folder-hi)" opacity="0.95" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 64 64"
          width={size}
          height={size}
          className="drop-shadow-[0_0.5px_1px_rgb(0_0_0/0.22)]"
        >
          <path
            d="M15 5.5h23.5L50 17v39.5c0 1.1-.9 2-2 2H15c-1.1 0-2-.9-2-2v-49c0-1.1.9-2 2-2z"
            fill="var(--mac-doc-page)"
            stroke="var(--mac-doc-edge)"
            strokeWidth={size <= 24 ? 2.4 : 0.6}
          />
          <path d="M38.5 5.5V15c0 1.1.9 2 2 2H50z" fill="var(--mac-doc-fold)" />
          {size >= 48 ? (
            <text
              x="31.5"
              y="52"
              textAnchor="middle"
              fontSize="6.4"
              fontWeight="600"
              letterSpacing="0.4"
              fill="var(--mac-doc-label)"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              JSON
            </text>
          ) : null}
        </svg>
      )}
      {glyphId ? (
        <span
          className="absolute flex items-center justify-center drop-shadow-[0_0.5px_0.5px_rgb(0_0_0/0.18)]"
          style={{
            width: glyphSize,
            height: glyphSize,
            left: (glyphCenter.x / 64) * size - glyphSize / 2,
            top: (glyphCenter.y / 64) * size - glyphSize / 2,
          }}
        >
          <NodeIcon iconId={glyphId} kind={kind} size={glyphSize} />
        </span>
      ) : null}
    </span>
  )
}
