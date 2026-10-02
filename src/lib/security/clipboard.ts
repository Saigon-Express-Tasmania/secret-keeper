/**
 * Clipboard writes for secrets, cleared automatically.
 *
 * After CLEAR_AFTER_MS (or on lock) the clipboard is overwritten with an
 * empty string, unless a newer copy from this app superseded it. Browsers
 * only allow clipboard writes while the document has focus, so a clear that
 * falls due in the background runs on the next focus instead. Anything the
 * OS already captured (clipboard history, sync) is out of our reach.
 */

export const CLEAR_AFTER_MS = 30_000

let generation = 0
let timer: ReturnType<typeof setTimeout> | null = null
let clearOnFocus = false
let focusListenerInstalled = false

function canUseClipboard(): boolean {
  return typeof navigator !== "undefined" && !!navigator.clipboard
}

function installFocusListener(): void {
  if (focusListenerInstalled || typeof window === "undefined") return
  focusListenerInstalled = true
  window.addEventListener("focus", () => {
    if (clearOnFocus) void clearNow()
  })
}

async function clearNow(): Promise<void> {
  if (!canUseClipboard()) return
  if (typeof document !== "undefined" && !document.hasFocus()) {
    clearOnFocus = true
    return
  }
  try {
    await navigator.clipboard.writeText("")
    clearOnFocus = false
  } catch {
    clearOnFocus = true
  }
}

function scheduleClear(): void {
  installFocusListener()
  const mine = ++generation
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    if (mine === generation) void clearNow()
  }, CLEAR_AFTER_MS)
}

/** Copy a secret string; it is wiped from the clipboard after 30 s. */
export async function copySecretText(text: string): Promise<void> {
  if (!canUseClipboard()) {
    throw new Error("Clipboard is not available in this browser.")
  }
  await navigator.clipboard.writeText(text)
  clearOnFocus = false
  scheduleClear()
}

/** Copy a secret image (e.g. an OTP QR code); also wiped after 30 s. */
export async function copySecretImage(blob: Blob): Promise<void> {
  if (!canUseClipboard() || typeof ClipboardItem === "undefined") {
    throw new Error("This browser can't copy images.")
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
  clearOnFocus = false
  scheduleClear()
}

/** Wipe a pending secret now (used on lock). No-op if nothing is pending. */
export function clearSecretClipboard(): void {
  const pending = timer !== null || clearOnFocus
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  generation++
  if (pending) {
    installFocusListener()
    void clearNow()
  }
}
