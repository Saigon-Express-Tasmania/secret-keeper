import { cn } from "@/lib/utils"

type TrafficLightsProps = {
  onClose: () => void
  onMinimize: () => void
  onZoom: () => void
  /** Window is key/focused; inactive windows show grey lights. */
  active?: boolean
  /** Unsaved changes: a dot sits in the close button. */
  dirty?: boolean
  zoomed?: boolean
  labels?: { close?: string; minimize?: string; zoom?: string }
  className?: string
}

const LIGHT =
  "relative flex size-3 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-mac-focus"

/** macOS window controls: close / minimize / zoom. */
export function TrafficLights({
  onClose,
  onMinimize,
  onZoom,
  active = true,
  dirty = false,
  zoomed = false,
  labels,
  className,
}: TrafficLightsProps) {
  const color = (on: string, edge: string) =>
    active
      ? { background: `var(${on})`, boxShadow: `inset 0 0 0 0.5px var(${edge})` }
      : undefined
  return (
    <div
      className={cn("group/tl flex items-center gap-2", className)}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={labels?.close ?? "Close"}
        title={labels?.close ?? "Close"}
        onClick={onClose}
        className={cn(LIGHT, !active && "bg-(--mac-tl-inactive) group-hover/tl:bg-(--mac-tl-close)")}
        style={color("--mac-tl-close", "--mac-tl-close-edge")}
      >
        <svg viewBox="0 0 8 8" className="size-[7px] opacity-0 group-hover/tl:opacity-100" aria-hidden>
          <path d="M1.6 1.6 6.4 6.4M6.4 1.6 1.6 6.4" stroke="rgb(0 0 0/0.55)" strokeWidth="1.15" strokeLinecap="round" />
        </svg>
        {dirty ? (
          <span className="absolute size-[4px] rounded-full bg-black/55 group-hover/tl:hidden" aria-hidden />
        ) : null}
      </button>
      <button
        type="button"
        aria-label={labels?.minimize ?? "Minimize"}
        title={labels?.minimize ?? "Minimize"}
        onClick={onMinimize}
        className={cn(LIGHT, !active && "bg-(--mac-tl-inactive) group-hover/tl:bg-(--mac-tl-min)")}
        style={color("--mac-tl-min", "--mac-tl-min-edge")}
      >
        <svg viewBox="0 0 8 8" className="size-[7px] opacity-0 group-hover/tl:opacity-100" aria-hidden>
          <path d="M1.2 4h5.6" stroke="rgb(0 0 0/0.55)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={labels?.zoom ?? "Zoom"}
        title={labels?.zoom ?? "Zoom"}
        aria-pressed={zoomed}
        onClick={onZoom}
        className={cn(LIGHT, !active && "bg-(--mac-tl-inactive) group-hover/tl:bg-(--mac-tl-zoom)")}
        style={color("--mac-tl-zoom", "--mac-tl-zoom-edge")}
      >
        <svg viewBox="0 0 8 8" className="size-[6px] opacity-0 group-hover/tl:opacity-100" aria-hidden>
          <path d="M1 1h4.2L1 5.2z M7 7H2.8L7 2.8z" fill="rgb(0 0 0/0.55)" />
        </svg>
      </button>
    </div>
  )
}
