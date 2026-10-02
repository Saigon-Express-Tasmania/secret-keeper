import { useCallback, useSyncExternalStore } from "react"

type Clock = { now: number; listeners: Set<() => void>; timer: number | null }

const clocks = new Map<number, Clock>()

function clockFor(ms: number): Clock {
  let clock = clocks.get(ms)
  if (!clock) {
    clock = { now: Date.now(), listeners: new Set(), timer: null }
    clocks.set(ms, clock)
  }
  return clock
}

function subscribe(ms: number, onChange: () => void): () => void {
  const clock = clockFor(ms)
  clock.listeners.add(onChange)
  if (clock.timer === null) {
    clock.now = Date.now()
    clock.timer = window.setInterval(() => {
      clock.now = Date.now()
      for (const listener of clock.listeners) listener()
    }, ms)
  }
  return () => {
    clock.listeners.delete(onChange)
    if (clock.listeners.size === 0 && clock.timer !== null) {
      window.clearInterval(clock.timer)
      clock.timer = null
    }
  }
}

/**
 * Current time, re-rendering every `ms`. All subscribers with the same period
 * share one interval, and only the components that call this re-render.
 */
export function useNow(ms = 1000): number {
  const sub = useCallback((onChange: () => void) => subscribe(ms, onChange), [ms])
  const snap = useCallback(() => clockFor(ms).now, [ms])
  return useSyncExternalStore(sub, snap)
}
