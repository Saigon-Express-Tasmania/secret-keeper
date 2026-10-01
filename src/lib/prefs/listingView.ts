const STORAGE_KEY = "ck:listing-view"

export type ListingViewMode = "list" | "grid"

/** Read the folder listing view mode preference. Default: list. */
export function readListingViewPref(): ListingViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "grid" ? "grid" : "list"
  } catch {
    return "list"
  }
}

/** Persist the folder listing view mode preference. */
export function writeListingViewPref(mode: ListingViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Quota / private mode — ignore
  }
}
