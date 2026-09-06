import { AwsClient } from "aws4fetch"

import type { StorageStrategy } from "@/lib/storage/types"

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /** S3-compatible API base (no trailing slash). */
  apiEndpoint: string
}

function requireEnv(name: keyof ImportMetaEnv, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

/**
 * Resolve the R2 S3 API endpoint.
 * Prefer the official `*.r2.cloudflarestorage.com` host.
 * `VITE_R2_ENDPOINT` is only used when it already points at that API host
 * (public CDN URLs are not valid for SigV4 object I/O).
 */
function resolveApiEndpoint(accountId: string, endpointOverride?: string): string {
  const override = endpointOverride?.replace(/\/$/, "")
  if (override && override.includes("r2.cloudflarestorage.com")) {
    return override
  }
  return `https://${accountId}.r2.cloudflarestorage.com`
}

function loadConfig(): R2Config {
  const accountId = requireEnv(
    "VITE_R2_ACCOUNT_ID",
    import.meta.env.VITE_R2_ACCOUNT_ID
  )
  return {
    accountId,
    accessKeyId: requireEnv(
      "VITE_R2_ACCESS_KEY_ID",
      import.meta.env.VITE_R2_ACCESS_KEY_ID
    ),
    secretAccessKey: requireEnv(
      "VITE_R2_SECRET_ACCESS_KEY",
      import.meta.env.VITE_R2_SECRET_ACCESS_KEY
    ),
    bucket: requireEnv("VITE_R2_BUCKET", import.meta.env.VITE_R2_BUCKET),
    apiEndpoint: resolveApiEndpoint(accountId, import.meta.env.VITE_R2_ENDPOINT),
  }
}

function objectUrl(config: R2Config, objectKey: string): string {
  const key = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return `${config.apiEndpoint}/${config.bucket}/${key}`
}

function bucketUrl(config: R2Config): string {
  return `${config.apiEndpoint}/${config.bucket}`
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

function parseListObjectsV2(xml: string): {
  keys: string[]
  truncated: boolean
  continuationToken: string | null
} {
  const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((match) =>
    decodeXmlText(match[1])
  )
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml)
  const tokenMatch = xml.match(
    /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/
  )
  return {
    keys,
    truncated,
    continuationToken: tokenMatch ? decodeXmlText(tokenMatch[1]) : null,
  }
}

function networkError(operation: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : "Network request failed"
  return new Error(
    `R2 ${operation} failed (network/CORS): ${message}. Ensure the bucket allows CORS for this origin.`
  )
}

async function httpError(
  operation: string,
  response: Response
): Promise<Error> {
  const body = await response.text().catch(() => "")
  return new Error(
    `R2 ${operation} failed (${response.status}): ${body || response.statusText}`
  )
}

/** Cloudflare R2 adapter (S3-compatible API via aws4fetch). */
export function createR2Storage(): StorageStrategy {
  const config = loadConfig()
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  })

  return {
    id: "r2",

    async download(objectKey) {
      const url = objectUrl(config, objectKey)
      let response: Response
      try {
        response = await client.fetch(url, { method: "GET" })
      } catch (err) {
        throw networkError("download", err)
      }

      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        throw await httpError("download", response)
      }

      const buffer = await response.arrayBuffer()
      return new Uint8Array(buffer)
    },

    async upload(objectKey, data) {
      const url = objectUrl(config, objectKey)
      let response: Response
      try {
        response = await client.fetch(url, {
          method: "PUT",
          body: data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          ) as ArrayBuffer,
          headers: {
            "Content-Type": "application/octet-stream",
          },
        })
      } catch (err) {
        throw networkError("upload", err)
      }

      if (!response.ok) {
        throw await httpError("upload", response)
      }
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
        if (continuationToken) {
          params.set("continuation-token", continuationToken)
        }

        const url = `${bucketUrl(config)}?${params.toString()}`
        let response: Response
        try {
          response = await client.fetch(url, { method: "GET" })
        } catch (err) {
          throw networkError("list", err)
        }

        if (!response.ok) {
          throw await httpError("list", response)
        }

        const xml = await response.text()
        const page = parseListObjectsV2(xml)
        keys.push(...page.keys)
        continuationToken = page.truncated ? page.continuationToken : null
      } while (continuationToken)

      return keys
    },

    async remove(objectKey) {
      const url = objectUrl(config, objectKey)
      let response: Response
      try {
        response = await client.fetch(url, { method: "DELETE" })
      } catch (err) {
        throw networkError("delete", err)
      }

      if (response.status === 404) {
        return
      }
      if (!response.ok) {
        throw await httpError("delete", response)
      }
    },
  }
}
