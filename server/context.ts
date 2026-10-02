import type { ServerConfig } from "./config"
import type { Mailer } from "./mail"
import type { ServerKeys } from "./secrets"
import type { ObjectStore } from "./store"

export type HandlerDeps = {
  store: ObjectStore
  keys: ServerKeys
  config: ServerConfig
  mailer?: Mailer | null
  /** Milliseconds since epoch; injectable for tests. */
  now?: () => number
  log?: (message: string) => void
}

/** Everything a route needs for one request. */
export type RouteContext = {
  store: ObjectStore
  keys: ServerKeys
  config: ServerConfig
  mailer: Mailer | null
  request: Request
  url: URL
  /** True on https (cookies get Secure + __Host-). */
  secure: boolean
  nowMs: () => number
  nowSeconds: () => number
  log: (message: string) => void
  /** Run work after the response (Netlify context.waitUntil when available). */
  waitUntil: (promise: Promise<unknown>) => void
}

export type Route = (ctx: RouteContext) => Promise<Response>
