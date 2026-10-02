/**
 * Idle auto-lock. Activity is any pointer, key, wheel, touch or scroll event;
 * the deadline is checked on an interval and whenever the tab becomes visible
 * again (background timers are throttled). `pagehide` locks immediately so a
 * page restored from the back/forward cache never comes back unlocked.
 */

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const

const CHECK_INTERVAL_MS = 15_000

export type IdleTracker = {
  touch: () => void
  isIdle: () => boolean
}

export function createIdleTracker(
  idleMs: number,
  now: () => number = Date.now
): IdleTracker {
  let last = now()
  return {
    touch: () => {
      last = now()
    },
    isIdle: () => now() - last >= idleMs,
  }
}

export type IdleWatchOptions = {
  idleMs: number
  onIdle: () => void
  onPageHide: () => void
}

/** Install listeners; returns a cleanup function. */
export function watchIdle({
  idleMs,
  onIdle,
  onPageHide,
}: IdleWatchOptions): () => void {
  const tracker = createIdleTracker(idleMs)
  const touch = () => tracker.touch()
  const check = () => {
    if (tracker.isIdle()) onIdle()
  }
  const onVisibility = () => {
    if (document.visibilityState === "visible") check()
  }

  const listenerOptions = { passive: true, capture: true } as const
  for (const type of ACTIVITY_EVENTS) {
    window.addEventListener(type, touch, listenerOptions)
  }
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("pagehide", onPageHide)
  const interval = setInterval(check, CHECK_INTERVAL_MS)

  return () => {
    for (const type of ACTIVITY_EVENTS) {
      window.removeEventListener(type, touch, listenerOptions)
    }
    document.removeEventListener("visibilitychange", onVisibility)
    window.removeEventListener("pagehide", onPageHide)
    clearInterval(interval)
  }
}
