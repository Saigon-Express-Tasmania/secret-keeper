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
        const message =
          err instanceof Error ? err.message : "Network request failed"
        throw new Error(
          `R2 download failed (network/CORS): ${message}. Ensure the bucket allows CORS for this origin.`
        )
      }

      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "")
        throw new Error(
          `R2 download failed (${response.status}): ${body || response.statusText}`
        )
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
        const message =
          err instanceof Error ? err.message : "Network request failed"
        throw new Error(
          `R2 upload failed (network/CORS): ${message}. Ensure the bucket allows CORS for this origin.`
        )
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "")
        throw new Error(
          `R2 upload failed (${response.status}): ${body || response.statusText}`
        )
      }
    },
  }
}
