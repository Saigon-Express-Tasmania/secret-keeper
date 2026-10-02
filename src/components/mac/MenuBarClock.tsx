import { useEffect, useState } from "react"

const fmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/** Menu-bar date/time; re-renders once a minute, on the minute. */
export function MenuBarClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let interval = 0
    const timeout = window.setTimeout(() => {
      setNow(new Date())
      interval = window.setInterval(() => setNow(new Date()), 60_000)
    }, 60_000 - (Date.now() % 60_000))
    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [])
  return (
    <time dateTime={now.toISOString()} className="px-2 tabular-nums whitespace-nowrap">
      {fmt.format(now).replace(/,(?=[^,]*$)/, "")}
    </time>
  )
}
