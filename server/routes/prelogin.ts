import type { PreloginResponse } from "../../src/shared/api"
import type { Route } from "../context"
import { jsonResponse, readJson } from "../http"
import { fakeKdf } from "../secrets"
import { loadAuthRecord, vaultNameFrom } from "./common"

/**
 * KDF parameters for a vault name. Unknown names get stable fake parameters
 * with the same shape, so this endpoint does not reveal which vaults exist.
 */
export const prelogin: Route = async (ctx) => {
  const name = vaultNameFrom(await readJson(ctx.request))
  const found = await loadAuthRecord(ctx, name)
  const body: PreloginResponse = { kdf: found?.record.kdf ?? fakeKdf(ctx.keys, name) }
  return jsonResponse(200, body)
}
