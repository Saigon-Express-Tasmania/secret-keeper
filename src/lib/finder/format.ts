/** Finder-style date/size/count strings. */

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})
const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
})
const longFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
})

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * `list`: "Today at 9:41 AM", "Yesterday at 4:12 PM", "Oct 2, 2026 at 9:41 AM".
 * `long`: "Thursday, October 2, 2026 at 9:41 AM" (Get Info).
 */
export function formatFinderDate(
  iso: string | undefined,
  style: "list" | "long" = "list",
  now: Date = new Date()
): string {
  if (!iso) return "--"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "--"
  const time = timeFmt.format(d)
  if (style === "long") return `${longFmt.format(d)} at ${time}`
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days === 0) return `Today at ${time}`
  if (days === 1) return `Yesterday at ${time}`
  return `${dateFmt.format(d)} at ${time}`
}

/** Decimal units like Finder: "312 bytes", "4 KB", "1.2 MB". */
export function formatFinderSize(bytes: number): string {
  if (bytes <= 0) return "Zero bytes"
  if (bytes < 1000) return `${bytes} bytes`
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`
}

/** Get Info style: "1,234 bytes". */
export function formatExactBytes(bytes: number): string {
  return `${bytes.toLocaleString()} ${bytes === 1 ? "byte" : "bytes"}`
}

export function formatItemCount(n: number): string {
  return n === 1 ? "1 item" : `${n.toLocaleString()} items`
}
