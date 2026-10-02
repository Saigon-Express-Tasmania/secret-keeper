/**
 * Local vault API for development: the same handler as the Netlify Function,
 * served on http://localhost:8787 (Vite proxies /api there).
 *
 *   npm run dev:api            # file store in .local/dev-store (no cloud needed)
 *   npm run dev:api -- --r2    # use the R2 bucket from .env.local
 *
 * Reads server settings from .env.local. Missing CK_SERVER_SECRET is generated
 * once into the store directory (.local/dev-store, or CK_DEV_STORE); missing
 * VAULT_SETUP_CODE defaults to "dev".
 * Emails are printed here instead of being sent (unless BREVO_API_KEY is set).
 */

import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import http from "node:http"
import { dirname, resolve } from "node:path"
import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"

import { readConfig } from "../server/config"
import { createHandler } from "../server/handler"
import { createMailer } from "../server/mail"
import { createR2Store } from "../server/r2Store"
import { deriveServerKeys } from "../server/secrets"
import { FileStore } from "./lib/fileStore"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const envFile = resolve(root, ".env.local")
if (existsSync(envFile)) process.loadEnvFile(envFile)

const storeDir = resolve(process.env.CK_DEV_STORE ?? resolve(root, ".local", "dev-store"))
mkdirSync(storeDir, { recursive: true })

if (!process.env.CK_SERVER_SECRET) {
  const secretFile = resolve(storeDir, "server-secret")
  if (!existsSync(secretFile)) {
    writeFileSync(secretFile, randomBytes(32).toString("base64"), { mode: 0o600 })
  }
  process.env.CK_SERVER_SECRET = readFileSync(secretFile, "utf8")
}
process.env.VAULT_SETUP_CODE ??= "dev"
process.env.CK_LOCAL_API = "true"

const useR2 = process.argv.includes("--r2")
const port = Number(process.env.CK_API_PORT ?? 8787)

const config = readConfig((name) => process.env[name], { requireR2: useR2 })
const keys = await deriveServerKeys(config.serverSecret)
const store = useR2 ? createR2Store(config.r2!) : new FileStore(storeDir)
const handler = createHandler({ store, keys, config, mailer: createMailer(config) })

const server = http.createServer(async (req, res) => {
  try {
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headers.append(name, v))
      else if (value !== undefined) headers.set(name, value)
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD"
    const request = new Request(`http://${req.headers.host ?? `localhost:${port}`}${req.url}`, {
      method: req.method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      // Required by Node's fetch for streaming request bodies.
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit)
    const response = await handler(request)
    const outHeaders: Record<string, string | string[]> = {}
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") outHeaders[name] = value
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length > 0) outHeaders["set-cookie"] = cookies
    res.writeHead(response.status, outHeaders)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error(error)
    res.writeHead(500).end()
  }
})

server.listen(port, () => {
  console.log(
    `vault API on http://localhost:${port}/api/vault (${useR2 ? "R2 bucket" : `file store ${storeDir}`})`
  )
  console.log(`setup code: ${process.env.VAULT_SETUP_CODE === "dev" ? "dev" : "(from .env.local)"}`)
})
