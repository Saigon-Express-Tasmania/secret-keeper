/**
 * End-to-end harness: real client modules ↔ real server handler, in-process.
 * Each "browser" has its own cookie jar and localStorage.
 */

import { sha256 } from "@noble/hashes/sha2.js"
import { vi } from "vitest"

import { createApiClient } from "@/lib/api/client"
import { splitArgonOutput, type Kdf } from "@/lib/crypto/kdf"
import type { SessionDeps } from "@/lib/vault/vaultSession"
import { utf8 } from "@/shared/bytes"

import { createTestServer, TEST_ORIGIN, type TestServer } from "../server/testkit"

/** Deterministic, fast stand-in for Argon2id (the real one is tested separately). */
export const fastKdf: Kdf = async (password, kdf) =>
  splitArgonOutput(sha256(utf8(`${password.normalize("NFKC")}|${kdf.salt}|${kdf.m}`)))

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value))
  }
}

export type Browser = {
  deps: SessionDeps
  cookies: Map<string, string>
  storage: MemoryStorage
  /** Make this browser's localStorage the global one (deviceStore uses it). */
  activate(): void
}

export function createBrowser(server: TestServer): Browser {
  const cookies = new Map<string, string>()
  const storage = new MemoryStorage()
  const fetchShim: typeof fetch = async (input, init) => {
    const url = new URL(String(input), TEST_ORIGIN)
    const headers = new Headers(init?.headers)
    headers.set("origin", TEST_ORIGIN)
    headers.set("sec-fetch-site", "same-origin")
    if (cookies.size > 0) {
      headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "))
    }
    const response = await server.handler(new Request(url, { ...init, headers }))
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";")
      const [name, value] = pair!.split("=") as [string, string]
      if (attributes.some((a) => a.trim() === "Max-Age=0")) cookies.delete(name.trim())
      else cookies.set(name.trim(), value)
    }
    return response
  }
  const browser: Browser = {
    deps: {
      api: createApiClient({ fetch: fetchShim, baseUrl: TEST_ORIGIN }),
      kdf: fastKdf,
      now: () => server.clock.now,
    },
    cookies,
    storage,
    activate: () => vi.stubGlobal("localStorage", storage),
  }
  return browser
}

export { createTestServer }
