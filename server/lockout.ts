/**
 * Failed-attempt lockout. The first FREE_FAILURES are free; after that each
 * failure locks the vault for min(2^(n-6) minutes, 4 hours).
 * A trusted device has its own counter and is revoked after
 * MAX_DEVICE_FAILURES, so a stolen device cookie is worth only a few guesses.
 */

export const FREE_FAILURES = 5
export const MAX_LOCK_SECONDS = 4 * 60 * 60
export const MAX_DEVICE_FAILURES = 5

export function lockSecondsAfter(failures: number): number {
  if (failures <= FREE_FAILURES) return 0
  return Math.min(2 ** (failures - FREE_FAILURES - 1) * 60, MAX_LOCK_SECONDS)
}

/** Count one failed attempt; returns the lock that now applies in seconds (0 = none). */
export function recordFailure(lock: { fails: number; until: number }, nowSeconds: number): number {
  lock.fails += 1
  const lockFor = lockSecondsAfter(lock.fails)
  if (lockFor > 0) lock.until = nowSeconds + lockFor
  return lockFor
}
