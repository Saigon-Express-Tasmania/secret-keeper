/**
 * Sign-in links look like https://site/verify#v=<vault>&t=<token>. The
 * token lives in the fragment so it is never sent to a server; the page
 * reads it once and removes it from the address bar and history.
 */

import { fromBase64Url } from "@/shared/bytes"
import { normalizeVaultName } from "@/shared/vaultName"

export const SIGN_IN_TOKEN_BYTES = 32

export type SignInLink = { vault: string; token: string }

export function parseSignInFragment(hash: string): SignInLink | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
  const vault = params.get("v")
  const token = params.get("t")
  if (!vault || !token) return null
  try {
    fromBase64Url(token, SIGN_IN_TOKEN_BYTES)
    return { vault: normalizeVaultName(vault), token }
  } catch {
    return null
  }
}
