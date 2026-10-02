/**
 * Production wiring: env → config → keys → R2 store → handler.
 * Built once per warm Function instance; a broken config is retried on the
 * next request instead of being cached.
 */

import { ConfigError, defaultEnvGetter, readConfig } from "./config"
import { createHandler, type Handler } from "./handler"
import { errorResponse, HttpError } from "./http"
import { createMailer } from "./mail"
import { createR2Store } from "./r2Store"
import { deriveServerKeys } from "./secrets"

let cached: Promise<Handler> | null = null

async function build(): Promise<Handler> {
  const config = readConfig(defaultEnvGetter(), { requireR2: true })
  const keys = await deriveServerKeys(config.serverSecret)
  return createHandler({
    store: createR2Store(config.r2!),
    keys,
    config,
    mailer: createMailer(config),
  })
}

export async function handleNetlifyRequest(
  request: Request,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<Response> {
  if (!cached) {
    cached = build()
    cached.catch(() => {
      cached = null
    })
  }
  let handler: Handler
  try {
    handler = await cached
  } catch (error) {
    const reason = error instanceof ConfigError || error instanceof Error ? error.message : String(error)
    console.error(`vault api misconfigured: ${reason}`)
    return errorResponse(
      new HttpError(503, "server_misconfigured", "The vault server is not configured.")
    )
  }
  return handler(request, { waitUntil })
}
