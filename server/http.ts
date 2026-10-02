/**
 * HTTP plumbing for the vault Function: typed errors, response helpers with
 * security headers, bounded body reading and strict field validation.
 */

import type { ApiErrorBody, ApiErrorCode } from "../src/shared/api"
import { fromBase64Url } from "../src/shared/bytes"
import { decodeFrame, encodeFrame, FRAME_CONTENT_TYPE } from "../src/shared/frame"

export const MAX_JSON_BODY_BYTES = 16 * 1024

export const SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
}

type ErrorExtra = Omit<ApiErrorBody["error"], "code" | "message">

export class HttpError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly extra: ErrorExtra
  readonly headers: Record<string, string>

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    extra: ErrorExtra = {},
    headers: Record<string, string> = {}
  ) {
    super(message)
    this.name = "HttpError"
    this.status = status
    this.code = code
    this.extra = extra
    this.headers = headers
  }
}

export const badRequest = (message = "Malformed request.") =>
  new HttpError(400, "bad_request", message)

function withHeaders(extra: HeadersInit | undefined, contentType: string): Headers {
  const headers = new Headers(extra)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
  headers.set("content-type", contentType)
  return headers
}

export function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withHeaders(headers, "application/json"),
  })
}

export function frameResponse(
  status: number,
  json: unknown,
  blob: Uint8Array,
  headers?: HeadersInit
): Response {
  return new Response(encodeFrame(json, blob), {
    status,
    headers: withHeaders(headers, FRAME_CONTENT_TYPE),
  })
}

export function errorResponse(error: HttpError): Response {
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message, ...error.extra },
  }
  const headers = new Headers(error.headers)
  if (error.extra.retryAfter !== undefined) {
    headers.set("retry-after", String(error.extra.retryAfter))
  }
  return jsonResponse(error.status, body, headers)
}

async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? NaN)
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.")
  }
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new HttpError(413, "payload_too_large", "Request body is too large.")
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function requireContentType(request: Request, expected: string): void {
  const actual = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
  if (actual !== expected) {
    throw new HttpError(415, "bad_request", `Expected ${expected}.`)
  }
}

export type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest()
  return value as JsonObject
}

export async function readJson(request: Request): Promise<JsonObject> {
  requireContentType(request, "application/json")
  const bytes = await readBodyBytes(request, MAX_JSON_BODY_BYTES)
  try {
    return asObject(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw badRequest()
  }
}

export async function readFrame(
  request: Request,
  maxBytes: number
): Promise<{ json: JsonObject; blob: Uint8Array }> {
  requireContentType(request, FRAME_CONTENT_TYPE)
  const bytes = await readBodyBytes(request, maxBytes)
  try {
    const { json, blob } = decodeFrame(bytes)
    return { json: asObject(json), blob }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw badRequest()
  }
}

// --- field validation -------------------------------------------------------

export function getString(
  body: JsonObject,
  key: string,
  options: { max?: number; optional?: false }
): string
export function getString(
  body: JsonObject,
  key: string,
  options: { max?: number; optional: true }
): string | undefined
export function getString(
  body: JsonObject,
  key: string,
  options: { max?: number; optional?: boolean } = {}
): string | undefined {
  const value = body[key]
  if (value === undefined && options.optional) return undefined
  if (typeof value !== "string" || value.length === 0 || value.length > (options.max ?? 256)) {
    throw badRequest(`Invalid field: ${key}`)
  }
  return value
}

export function getBytes(body: JsonObject, key: string, length: number): Uint8Array<ArrayBuffer> {
  const value = getString(body, key, { max: Math.ceil((length * 4) / 3) + 4 })
  try {
    return fromBase64Url(value, length)
  } catch {
    throw badRequest(`Invalid field: ${key}`)
  }
}

export function getOptionalBytes(
  body: JsonObject,
  key: string,
  length: number
): Uint8Array<ArrayBuffer> | undefined {
  return body[key] === undefined ? undefined : getBytes(body, key, length)
}

export function getBoolean(body: JsonObject, key: string): boolean {
  const value = body[key]
  if (value === undefined) return false
  if (typeof value !== "boolean") throw badRequest(`Invalid field: ${key}`)
  return value
}

export function getObject(body: JsonObject, key: string): JsonObject {
  return asObject(body[key])
}
