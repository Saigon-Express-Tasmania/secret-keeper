/**
 * External image URL icons.
 *
 * A node's `icon` may be an absolute `https://` image URL instead of a
 * catalog id. Such URLs come from vault data (including imported vaults), so
 * they are untrusted and are re-validated on every render.
 *
 * Security rule: an external icon URL is ONLY ever used as the `src` of a
 * plain `<img>` element. Browsers render `<img>` content in secure static
 * mode — even an SVG served from the URL cannot run scripts, load
 * sub-resources, or touch the page DOM, and non-image responses simply fail
 * to decode. Never `fetch()` these URLs, inject their content as markup,
 * pass them to Iconify, or use them in `<object>`, `<embed>`, `<iframe>`,
 * or CSS `url()`.
 *
 * This module must not import vault or catalog code (it is used by both).
 */

export const MAX_ICON_URL_LENGTH = 2048

export type ExternalIconUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

// Whitespace and C0/C1 control characters anywhere in the raw input.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\s\u0000-\u001f\u007f-\u009f]/

/** Validate and normalize a user- or vault-supplied external icon URL. */
export function parseExternalIconUrl(input: string): ExternalIconUrlResult {
  const raw = input.trim()
  if (!raw) return { ok: false, error: "Enter an image URL." }
  if (raw.length > MAX_ICON_URL_LENGTH) {
    return {
      ok: false,
      error: `URL is too long (max ${MAX_ICON_URL_LENGTH} characters).`,
    }
  }
  if (FORBIDDEN_CHARS.test(raw)) {
    return { ok: false, error: "URL must not contain spaces or control characters." }
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: "Enter a full URL starting with https://." }
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "Only https:// image URLs are allowed." }
  }
  if (url.username || url.password) {
    return { ok: false, error: "URL must not contain a username or password." }
  }
  if (!url.hostname) {
    return { ok: false, error: "URL must include a host name." }
  }
  if (url.href.length > MAX_ICON_URL_LENGTH) {
    return {
      ok: false,
      error: `URL is too long (max ${MAX_ICON_URL_LENGTH} characters).`,
    }
  }
  return { ok: true, url: url.href }
}

/** Normalized URL if `value` is a valid external icon URL, else null. */
export function externalIconUrl(value: string | undefined): string | null {
  if (typeof value !== "string") return null
  if (!value.trim().toLowerCase().startsWith("https://")) return null
  const result = parseExternalIconUrl(value)
  return result.ok ? result.url : null
}

export function isExternalIconUrl(value: string | undefined): boolean {
  return externalIconUrl(value) !== null
}

/** Shape of a vendored Iconify id, e.g. `fluent-color:document-16`. */
const CATALOG_ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$/

/**
 * Value safe to store as a node icon: a catalog-shaped id or a valid
 * external https image URL. Throws otherwise.
 */
export function assertStorableIcon(value: string): void {
  if (CATALOG_ID_SHAPE.test(value)) return
  if (isExternalIconUrl(value)) return
  throw new Error("Invalid icon: use a built-in icon or an https:// image URL.")
}
