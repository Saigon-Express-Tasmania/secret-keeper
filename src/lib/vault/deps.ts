import { createApiClient } from "@/lib/api/client"
import type { SessionDeps } from "@/lib/vault/vaultSession"

/** Browser wiring: same-origin API, real Argon2id. */
export const sessionDeps: SessionDeps = { api: createApiClient() }
