import { cn } from "@/lib/utils"

export const APP_BG_SRC = "/gate-bg.jpg"
export const APP_BG_CREDIT_HREF =
  "https://unsplash.com/photos/aerial-photo-of-green-trees-ugnrXk1129g"
export const APP_BG_CREDIT_LABEL =
  "Photo by Marita Kavelashvili on Unsplash"

type AppBackdropProps = {
  /**
   * `gate`: darkened photo behind the unlock card.
   * `desktop`: crisp "wallpaper" behind the Finder window (dimmed in Dark Mode).
   */
  variant?: "gate" | "desktop"
  priority?: boolean
}

export function AppBackdrop({ variant = "gate", priority = false }: AppBackdropProps) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <img
        src={APP_BG_SRC}
        alt=""
        fetchPriority={priority ? "high" : "auto"}
        className={cn("size-full object-cover", variant === "desktop" && "scale-105")}
      />
      <div
        className={cn(
          "absolute inset-0",
          variant === "desktop"
            ? "bg-(--mac-desktop-dim)"
            : "bg-gradient-to-b from-black/50 via-black/30 to-black/60"
        )}
      />
    </div>
  )
}
