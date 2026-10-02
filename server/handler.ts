/**
 * The vault API: one Request → Response function used by the Netlify
 * Function, the local dev server and the tests.
 */

import { API_PREFIX, CLIENT_HEADER, CLIENT_HEADER_VALUE } from "../src/shared/api"
import type { HandlerDeps, Route, RouteContext } from "./context"
import { errorResponse, HttpError } from "./http"
import { account } from "./routes/account"
import { getBlob, putBlob } from "./routes/blob"
import { create } from "./routes/create"
import { forgetDevice } from "./routes/device"
import { emailLink } from "./routes/emailLink"
import { prelogin } from "./routes/prelogin"
import { unlock } from "./routes/unlock"

export type { HandlerDeps } from "./context"

export type Platform = { waitUntil?: (promise: Promise<unknown>) => void }
export type Handler = (request: Request, platform?: Platform) => Promise<Response>

type Routes = Record<string, Partial<Record<string, Route>>>

const ROUTES: Routes = {
  prelogin: { POST: prelogin },
  unlock: { POST: unlock },
  create: { POST: create },
  blob: { GET: getBlob, PUT: putBlob },
  account: { POST: account },
  "email-link": { POST: emailLink },
  "device/forget": { POST: forgetDevice },
}

/** Requests must come from our own pages: same origin, custom header. */
function checkRequestOrigin(request: Request, url: URL): void {
  if (request.headers.get(CLIENT_HEADER) !== CLIENT_HEADER_VALUE) {
    throw new HttpError(400, "bad_request", "Missing client header.")
  }
  const origin = request.headers.get("origin")
  if (origin !== null && origin !== url.origin) {
    throw new HttpError(403, "bad_origin", "Cross-origin requests are not allowed.")
  }
  const site = request.headers.get("sec-fetch-site")
  if (site !== null && site !== "same-origin" && site !== "none") {
    throw new HttpError(403, "bad_origin", "Cross-site requests are not allowed.")
  }
}

export function createHandler(deps: HandlerDeps, routes: Routes = ROUTES): Handler {
  const now = deps.now ?? Date.now
  const log = deps.log ?? ((message: string) => console.error(message))

  return async (request, platform = {}) => {
    try {
      const url = new URL(request.url)
      if (!url.pathname.startsWith(`${API_PREFIX}/`)) {
        throw new HttpError(404, "not_found", "Not found.")
      }
      const methods = routes[url.pathname.slice(API_PREFIX.length + 1)]
      if (!methods) throw new HttpError(404, "not_found", "Not found.")
      const route = methods[request.method]
      if (!route) {
        throw new HttpError(405, "method_not_allowed", "Method not allowed.", {}, {
          allow: Object.keys(methods).join(", "),
        })
      }
      checkRequestOrigin(request, url)

      const pending: Promise<unknown>[] = []
      const ctx: RouteContext = {
        store: deps.store,
        keys: deps.keys,
        config: deps.config,
        mailer: deps.mailer ?? null,
        request,
        url,
        secure: url.protocol === "https:",
        nowMs: now,
        nowSeconds: () => Math.floor(now() / 1000),
        log,
        waitUntil: (promise) => {
          const guarded = promise.catch((error: unknown) =>
            log(`background task failed: ${error instanceof Error ? error.message : String(error)}`)
          )
          if (platform.waitUntil) platform.waitUntil(guarded)
          else pending.push(guarded)
        },
      }
      const response = await route(ctx)
      // Without a platform waitUntil (tests, local dev) finish background work first.
      if (pending.length > 0) await Promise.all(pending)
      return response
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error)
      log(`vault api error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
      return errorResponse(new HttpError(500, "server_error", "Something went wrong."))
    }
  }
}
