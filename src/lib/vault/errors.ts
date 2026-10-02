import { isApiError } from "@/lib/api/client"

function minutes(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`
  const m = Math.round(seconds / 60)
  return m < 90 ? `${m} minutes` : `${Math.round(m / 60)} hours`
}

/** User-facing text for errors from the vault API and client flows. */
export function describeError(error: unknown): string {
  if (isApiError(error)) {
    switch (error.code) {
      case "bad_credentials":
        return error.retryAfter
          ? `Wrong vault name or master password. The vault is now locked for ${minutes(error.retryAfter)}.`
          : "Wrong vault name or master password."
      case "locked":
        return `Too many failed attempts. Try again in ${minutes(error.retryAfter ?? 60)}.`
      case "bad_second_factor":
        return "That code or link is not valid (or was already used)."
      case "step_up_failed":
        return error.message
      case "session_expired":
        return "Your session ended. Unlock the vault again."
      case "conflict":
        return "The vault was changed elsewhere. Try again."
      case "bad_setup_code":
        return "The setup code is not correct."
      case "setup_disabled":
        return "This server does not allow creating vaults."
      case "exists":
        return "A vault with that name already exists."
      case "rate_limited":
        return "Too many requests. Wait a minute and try again."
      case "server_misconfigured":
        return "The vault server is not configured yet."
      default:
        return error.message
    }
  }
  return error instanceof Error ? error.message : "Something went wrong."
}
