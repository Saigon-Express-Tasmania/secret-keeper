const STORAGE_KEY = "ck:auto-lock-minutes"

export const AUTO_LOCK_CHOICES = [1, 5, 10, 15, 30, 60] as const
export const DEFAULT_AUTO_LOCK_MINUTES = 10

/** Minutes of inactivity before the vault locks (per device). */
export function readAutoLockMinutes(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return (AUTO_LOCK_CHOICES as readonly number[]).includes(value)
      ? value
      : DEFAULT_AUTO_LOCK_MINUTES
  } catch {
    return DEFAULT_AUTO_LOCK_MINUTES
  }
}

export function writeAutoLockMinutes(minutes: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(minutes))
  } catch {
    // Quota / private mode — keep the default
  }
}
