/**
 * Test helpers: a handler wired to an in-memory store, a fixed server secret,
 * a controllable clock and a capturing mailer. Not used in production.
 */

import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from "../src/shared/api"
import { toBase64Url } from "../src/shared/bytes"
import type { ServerConfig } from "./config"
import { createHandler, type Handler } from "./handler"
import type { MailMessage, Mailer } from "./mail"
import { MemoryStore } from "./memoryStore"
import { deriveServerKeys, type ServerKeys } from "./secrets"

export const TEST_ORIGIN = "https://vault.test"
export const TEST_SETUP_CODE = "let-me-in"

export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    serverSecret: new Uint8Array(32).fill(7),
    setupCode: TEST_SETUP_CODE,
    r2: null,
    mail: null,
    siteUrl: TEST_ORIGIN,
    dev: false,
    backupIntervalHours: 8,
    backupRetentionDays: 7,
    ...overrides,
  }
}

export class CapturingMailer implements Mailer {
  readonly sent: MailMessage[] = []
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message)
  }
}

export type TestServer = {
  handler: Handler
  store: MemoryStore
  keys: ServerKeys
  config: ServerConfig
  mailer: CapturingMailer
  clock: { now: number }
  logs: string[]
}

export async function createTestServer(
  overrides: Partial<ServerConfig> = {}
): Promise<TestServer> {
  const config = testConfig(overrides)
  const keys = await deriveServerKeys(config.serverSecret)
  const store = new MemoryStore()
  const mailer = new CapturingMailer()
  const clock = { now: Date.UTC(2026, 9, 1, 12, 0, 0) }
  const logs: string[] = []
  const handler = createHandler({
    store,
    keys,
    config,
    mailer,
    now: () => clock.now,
    log: (message) => logs.push(message),
  })
  return { handler, store, keys, config, mailer, clock, logs }
}

/** A same-origin API request as our client sends it. */
export function apiRequest(
  path: string,
  init: { method?: string; json?: unknown; body?: BodyInit; contentType?: string; headers?: Record<string, string> } = {}
): Request {
  const headers = new Headers({
    [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
    origin: TEST_ORIGIN,
    ...init.headers,
  })
  let body: BodyInit | undefined = init.body
  if (init.json !== undefined) {
    body = JSON.stringify(init.json)
    headers.set("content-type", "application/json")
  } else if (init.contentType) {
    headers.set("content-type", init.contentType)
  }
  return new Request(`${TEST_ORIGIN}/api/vault/${path}`, {
    method: init.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body,
  })
}

export function b64(bytes: Uint8Array): string {
  return toBase64Url(bytes)
}
