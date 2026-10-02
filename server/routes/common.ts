import { normalizeVaultName, vaultObjectKey } from "../../src/shared/vaultName"
import { decodeAuthRecord, type AuthRecord } from "../authRecord"
import type { RouteContext } from "../context"
import { badRequest, type JsonObject } from "../http"

export function vaultNameFrom(body: JsonObject): string {
  const value = body.vault
  if (typeof value !== "string" || value.length > 64) throw badRequest("Invalid vault name.")
  try {
    return normalizeVaultName(value)
  } catch {
    throw badRequest("Invalid vault name.")
  }
}

/** HEAD the vault object and decode its auth record (null if absent/foreign). */
export async function loadAuthRecord(
  ctx: RouteContext,
  name: string
): Promise<{ record: AuthRecord; etag: string } | null> {
  const head = await ctx.store.head(vaultObjectKey(name))
  if (!head) return null
  const record = decodeAuthRecord(head.meta)
  return record ? { record, etag: head.etag } : null
}
