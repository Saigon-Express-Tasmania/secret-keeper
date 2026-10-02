/**
 * Cloudflare R2 through its S3-compatible API, signed with aws4fetch.
 * Runs only on the server: the credentials come from server-side env and
 * never reach the browser bundle.
 */

import { AwsClient } from "aws4fetch"

import {
  PreconditionFailedError,
  StoreError,
  type ObjectHead,
  type ObjectMeta,
  type ObjectStore,
  type PutOptions,
  type StoredObject,
} from "./store"

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /** Optional S3 API host override (jurisdictional buckets). */
  endpoint?: string
}

const META_PREFIX = "x-amz-meta-"

/**
 * Prefer the official `*.r2.cloudflarestorage.com` S3 API host; public CDN
 * URLs cannot be used for signed object I/O.
 */
function resolveApiEndpoint(accountId: string, override?: string): string {
  const trimmed = override?.replace(/\/$/, "")
  if (trimmed && trimmed.includes("r2.cloudflarestorage.com")) return trimmed
  return `https://${accountId}.r2.cloudflarestorage.com`
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

export function parseListObjectsV2(xml: string): {
  keys: string[]
  continuationToken: string | null
} {
  const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((match) =>
    decodeXmlText(match[1]!)
  )
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml)
  const token = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)
  return {
    keys,
    continuationToken: truncated && token ? decodeXmlText(token[1]!) : null,
  }
}

function readMeta(headers: Headers): ObjectMeta {
  const meta: ObjectMeta = {}
  headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (lower.startsWith(META_PREFIX)) meta[lower.slice(META_PREFIX.length)] = value
  })
  return meta
}

async function failure(operation: string, response: Response): Promise<Error> {
  const body = await response.text().catch(() => "")
  // Keep provider error text out of client responses; log-friendly only.
  return new StoreError(`R2 ${operation} failed (${response.status}): ${body.slice(0, 200)}`)
}

export function createR2Store(config: R2Config): ObjectStore {
  const endpoint = resolveApiEndpoint(config.accountId, config.endpoint)
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  })
  const objectUrl = (key: string) => `${endpoint}/${config.bucket}/${encodeKey(key)}`

  return {
    async head(key): Promise<ObjectHead | null> {
      const response = await client.fetch(objectUrl(key), { method: "HEAD" })
      if (response.status === 404) return null
      if (!response.ok) throw await failure("head", response)
      return {
        etag: response.headers.get("etag") ?? "",
        size: Number(response.headers.get("content-length") ?? 0),
        meta: readMeta(response.headers),
      }
    },

    async get(key): Promise<StoredObject | null> {
      const response = await client.fetch(objectUrl(key), { method: "GET" })
      if (response.status === 404) return null
      if (!response.ok) throw await failure("get", response)
      const body = new Uint8Array(await response.arrayBuffer())
      return {
        etag: response.headers.get("etag") ?? "",
        size: body.byteLength,
        meta: readMeta(response.headers),
        body,
      }
    },

    async put(key, body, options: PutOptions = {}) {
      const headers: Record<string, string> = {
        "content-type": options.contentType ?? "application/octet-stream",
      }
      for (const [name, value] of Object.entries(options.meta ?? {})) {
        headers[`${META_PREFIX}${name.toLowerCase()}`] = value
      }
      if (options.ifMatch !== undefined) headers["if-match"] = options.ifMatch
      if (options.ifNoneMatch) headers["if-none-match"] = options.ifNoneMatch

      const copy = new Uint8Array(body.byteLength)
      copy.set(body)
      const response = await client.fetch(objectUrl(key), {
        method: "PUT",
        body: copy,
        headers,
      })
      if (response.status === 412 || response.status === 409) {
        await response.body?.cancel()
        throw new PreconditionFailedError(key)
      }
      if (!response.ok) throw await failure("put", response)
      return { etag: response.headers.get("etag") ?? "" }
    },

    async copy(sourceKey, destinationKey) {
      const response = await client.fetch(objectUrl(destinationKey), {
        method: "PUT",
        headers: {
          "x-amz-copy-source": `/${config.bucket}/${encodeKey(sourceKey)}`,
          "x-amz-metadata-directive": "COPY",
        },
      })
      if (!response.ok) throw await failure("copy", response)
      await response.body?.cancel()
    },

    async list(prefix) {
      const keys: string[] = []
      let continuationToken: string | null = null
      do {
        const params = new URLSearchParams({
          "list-type": "2",
          prefix,
          "max-keys": "1000",
        })
        if (continuationToken) params.set("continuation-token", continuationToken)
        const response = await client.fetch(
          `${endpoint}/${config.bucket}?${params.toString()}`,
          { method: "GET" }
        )
        if (!response.ok) throw await failure("list", response)
        const page = parseListObjectsV2(await response.text())
        keys.push(...page.keys)
        continuationToken = page.continuationToken
      } while (continuationToken)
      return keys
    },

    async delete(key) {
      const response = await client.fetch(objectUrl(key), { method: "DELETE" })
      if (response.status === 404) return
      if (!response.ok) throw await failure("delete", response)
      await response.body?.cancel()
    },
  }
}
