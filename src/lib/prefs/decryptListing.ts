const STORAGE_KEY = "ck:decrypt-listing"

/** Read the decrypt-listing preference. Default: off. */
export function readDecryptListingPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

/** Persist the decrypt-listing preference. */
export function writeDecryptListingPref(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // Quota / private mode — ignore
  }
}
