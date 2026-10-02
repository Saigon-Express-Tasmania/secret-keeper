/**
 * Keyboard shortcut matching / labels. `mod` is ⌘ on macOS and Ctrl elsewhere,
 * so one definition works on every platform.
 */

type NavigatorWithUAData = Navigator & {
  userAgentData?: { platform?: string }
}

export const IS_MAC: boolean =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(
    (navigator as NavigatorWithUAData).userAgentData?.platform ??
      navigator.platform ??
      ""
  )

export type Shortcut = {
  /** Lower-cased `KeyboardEvent.key` ("n", "backspace", "arrowup", "[", " "). */
  key: string
  /** `KeyboardEvent.code` fallback, e.g. "KeyN" (⌥ changes `key` on macOS). */
  code?: string
  /** ⌘ on macOS, Ctrl elsewhere. */
  mod?: boolean
  shift?: boolean
  /** ⌥ / Alt. */
  alt?: boolean
  /** ⌃ on macOS only (elsewhere Ctrl is already `mod`). */
  ctrl?: boolean
  /** Restrict to one platform. */
  platform?: "mac" | "other"
}

type KeyLike = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>

export function matchShortcut(e: KeyLike, s: Shortcut): boolean {
  if (s.platform === "mac" && !IS_MAC) return false
  if (s.platform === "other" && IS_MAC) return false
  if (e.shiftKey !== !!s.shift || e.altKey !== !!s.alt) return false
  if (IS_MAC) {
    if (e.metaKey !== !!s.mod || e.ctrlKey !== !!s.ctrl) return false
  } else {
    if (e.metaKey || e.ctrlKey !== !!(s.mod || s.ctrl)) return false
  }
  const key = (e.key ?? "").toLowerCase()
  if (key === s.key) return true
  return !!s.code && e.code === s.code
}

const MAC_KEYS: Record<string, string> = {
  backspace: "⌫",
  delete: "⌦",
  enter: "↩",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  escape: "⎋",
  tab: "⇥",
  " ": "Space",
}

const OTHER_KEYS: Record<string, string> = {
  backspace: "Backspace",
  delete: "Delete",
  enter: "Enter",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  escape: "Esc",
  tab: "Tab",
  " ": "Space",
}

/** "⌥⌘N" on macOS, "Ctrl+Alt+N" elsewhere. */
export function formatShortcut(s: Shortcut): string {
  if (IS_MAC) {
    const key = MAC_KEYS[s.key] ?? s.key.toUpperCase()
    return `${s.ctrl ? "⌃" : ""}${s.alt ? "⌥" : ""}${s.shift ? "⇧" : ""}${s.mod ? "⌘" : ""}${key}`
  }
  const key = OTHER_KEYS[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : s.key.toUpperCase())
  const parts: string[] = []
  if (s.mod || s.ctrl) parts.push("Ctrl")
  if (s.alt) parts.push("Alt")
  if (s.shift) parts.push("Shift")
  parts.push(key)
  return parts.join("+")
}

/** First shortcut that applies on this platform. */
export function primaryShortcut(list: readonly Shortcut[] | undefined): Shortcut | undefined {
  return list?.find(
    (s) =>
      !s.platform ||
      (s.platform === "mac" && IS_MAC) ||
      (s.platform === "other" && !IS_MAC)
  )
}

const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

/** True for text inputs, textareas, selects and contenteditable elements. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true
  }
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.has(target.type)
  }
  return false
}

/** True when the event comes from an open menu, menubar or modal dialog. */
export function isInOverlay(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest(
    '[role="menu"],[role="menubar"],[role="alertdialog"],[role="dialog"][aria-modal="true"],[data-slot="dialog-content"],[data-slot="alert-dialog-content"]'
  )
}
