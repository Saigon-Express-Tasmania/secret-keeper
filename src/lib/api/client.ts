/**
 * Typed client for the vault API (/api/vault/*). Same-origin only; the
 * trusted-device cookie travels automatically, the session as a Bearer token.
 */

import {
  API_PREFIX,
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  type AccountRequest,
  type AccountStatus,
  type ApiErrorBody,
  type ApiErrorCode,
  type BlobResponse,
  type CreateRequest,
  type CreateResponse,
  type EmailLinkRequest,
  type EmailLinkResponse,
  type PreloginResponse,
  type PutBlobRequest,
  type PutBlobResponse,
  type SecondFactorMethod,
  type UnlockRequest,
  type UnlockResponse,
} from "@/shared/api"
import { validateKdf } from "@/shared/ckv3"
import { decodeFrame, encodeFrame, FRAME_CONTENT_TYPE } from "@/shared/frame"

export class ApiError extends Error {
  readonly code: ApiErrorCode | "network"
  readonly status: number
  readonly retryAfter?: number
  readonly methods?: SecondFactorMethod[]
  readonly etag?: string
  readonly rev?: number

  constructor(
    status: number,
    body: Omit<Partial<ApiErrorBody["error"]>, "code"> & { code: ApiErrorCode | "network" }
  ) {
    super(body.message ?? "Request failed.")
    this.name = "ApiError"
    this.status = status
    this.code = body.code
    this.retryAfter = body.retryAfter
    this.methods = body.methods
    this.etag = body.etag
    this.rev = body.rev
  }
}

export function isApiError(error: unknown, code?: ApiError["code"]): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT"
  json?: unknown
  frame?: { json: unknown; blob: Uint8Array }
  session?: string
}

export type ApiClientOptions = {
  fetch?: typeof fetch
  /** Origin prefix for non-browser use (tests); "" in the browser. */
  baseUrl?: string
}

export function createApiClient(options: ApiClientOptions = {}) {
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const baseUrl = options.baseUrl ?? ""

  async function send(path: string, request: RequestOptions): Promise<Response> {
    const headers = new Headers({ [CLIENT_HEADER]: CLIENT_HEADER_VALUE })
    let body: BodyInit | undefined
    if (request.json !== undefined) {
      headers.set("content-type", "application/json")
      body = JSON.stringify(request.json)
    } else if (request.frame) {
      headers.set("content-type", FRAME_CONTENT_TYPE)
      body = encodeFrame(request.frame.json, request.frame.blob)
    }
    if (request.session) headers.set("authorization", `Bearer ${request.session}`)

    let response: Response
    try {
      response = await doFetch(`${baseUrl}${API_PREFIX}/${path}`, {
        method: request.method ?? (body === undefined ? "GET" : "POST"),
        headers,
        body,
        credentials: "same-origin",
        cache: "no-store",
      })
    } catch {
      throw new ApiError(0, {
        code: "network",
        message: "Can't reach the vault server. Check your connection.",
      })
    }
    if (!response.ok) {
      let error: Partial<ApiErrorBody["error"]> | undefined
      try {
        error = ((await response.json()) as ApiErrorBody).error
      } catch {
        error = undefined
      }
      throw new ApiError(response.status, {
        ...error,
        code: error?.code ?? "server_error",
        message: error?.message ?? `Request failed (${response.status}).`,
      })
    }
    return response
  }

  async function sendJson<T>(path: string, request: RequestOptions): Promise<T> {
    return (await (await send(path, request)).json()) as T
  }

  async function sendForFrame<T>(
    path: string,
    request: RequestOptions
  ): Promise<{ meta: T; blob: Uint8Array }> {
    const bytes = new Uint8Array(await (await send(path, request)).arrayBuffer())
    const { json, blob } = decodeFrame(bytes)
    return { meta: json as T, blob: blob.slice() }
  }

  return {
    async prelogin(vault: string): Promise<PreloginResponse> {
      const response = await sendJson<PreloginResponse>("prelogin", { json: { vault } })
      return { kdf: validateKdf(response.kdf) }
    },
    unlock(request: UnlockRequest) {
      return sendForFrame<UnlockResponse>("unlock", { json: request })
    },
    create(request: CreateRequest, blob: Uint8Array) {
      return sendJson<CreateResponse>("create", { frame: { json: request, blob } })
    },
    getBlob(session: string) {
      return sendForFrame<BlobResponse>("blob", { method: "GET", session })
    },
    putBlob(session: string, request: PutBlobRequest, blob: Uint8Array) {
      return sendJson<PutBlobResponse>("blob", {
        method: "PUT",
        session,
        frame: { json: request, blob },
      })
    },
    account<T = AccountStatus>(session: string, request: AccountRequest) {
      return sendJson<T>("account", { json: request, session })
    },
    emailLink(request: EmailLinkRequest) {
      return sendJson<EmailLinkResponse>("email-link", { json: request })
    },
    forgetDevice(vault: string) {
      return sendJson<{ ok: true }>("device/forget", { json: { vault } })
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
