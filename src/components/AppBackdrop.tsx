import { cn } from "@/lib/utils"

export const APP_BG_SRC = "/gate-bg.jpg"
export const APP_BG_CREDIT_HREF =
  "https://unsplash.com/photos/aerial-photo-of-green-trees-ugnrXk1129g"
export const APP_BG_CREDIT_LABEL =
  "Photo by Marita Kavelashvili on Unsplash"

type AppBackdropProps = {
  blurred?: boolean
  priority?: boolean
}

export function AppBackdrop({ blurred = false, priority = false }: AppBackdropProps) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <img
        src={APP_BG_SRC}
        alt=""
        fetchPriority={priority ? "high" : "auto"}
        className={cn(
          "size-full object-cover",
          blurred && "scale-110 blur-2xl"
        )}
      />
      <div
        className={
          blurred
            ? "absolute inset-0 bg-gradient-to-br from-emerald-100/55 via-background/50 to-sky-100/45"
            : "absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60"
        }
      />
    </div>
  )
}
