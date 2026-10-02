import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void) {
  window.addEventListener("focus", onChange)
  window.addEventListener("blur", onChange)
  document.addEventListener("visibilitychange", onChange)
  return () => {
    window.removeEventListener("focus", onChange)
    window.removeEventListener("blur", onChange)
    document.removeEventListener("visibilitychange", onChange)
  }
}

/** Whether the browser window has focus (macOS "key window" state). */
export function useWindowActive(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.hasFocus() && document.visibilityState === "visible",
    () => true
  )
}
