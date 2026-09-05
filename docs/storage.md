# Storage

Storage backends are selected with the strategy pattern. The UI and crypto layers talk only to `StorageStrategy`; each provider adapter owns its SDK and credentials.

## Interface

```ts
interface StorageStrategy {
  readonly id: "r2" | "s3" | "supabase" | "gdrive"
  download(objectKey: string): Promise<Uint8Array | null> // null = missing
  upload(objectKey: string, data: Uint8Array): Promise<void>
}
```

Factory: `createStorage()` in `src/lib/storage/createStorage.ts`, driven by `VITE_STORAGE_PROVIDER`.

Vault object key: `VITE_VAULT_OBJECT_KEY` (default `vault.enc`).

Local ciphertext cache: `src/lib/storage/localCache.ts` (browser `localStorage`).

## Providers and env vars

Copy `.env.example` to `.env.local` (or `.env`) and fill only the provider you use.

Required for crypto (all providers):

| Variable | Purpose |
| --- | --- |
| `VITE_VAULT_SALT_KEY` | Argon2 pepper; long random secret; keep stable |

### Cloudflare R2 (`r2`) — implemented

| Variable | Purpose |
| --- | --- |
| `VITE_R2_ACCOUNT_ID` | Cloudflare account id |
| `VITE_R2_ACCESS_KEY_ID` | R2 API token access key |
| `VITE_R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `VITE_R2_BUCKET` | Bucket name |
| `VITE_R2_ENDPOINT` | Optional; only used if it contains `r2.cloudflarestorage.com` |

The adapter talks to the **S3 API** at `https://<account_id>.r2.cloudflarestorage.com` via `aws4fetch` (path-style `/{bucket}/{key}`). A public CDN hostname is **not** used for download/upload.

**CORS:** adding origins in the dashboard is not enough. `aws4fetch` sends `Authorization`, `x-amz-date`, and `x-amz-content-sha256`, which triggers a browser preflight. If those headers are missing from `AllowedHeaders`, R2 returns `403 CORS not configured for this bucket` with no `Access-Control-Allow-Origin` header.

Paste this as the bucket CORS policy (Settings → CORS Policy → JSON). Origins must include the scheme (`http://localhost:5173`, not `localhost:5173`):

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://localhost:5174"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": [
      "Authorization",
      "Content-Type",
      "x-amz-content-sha256",
      "x-amz-date"
    ],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Add production origins (e.g. `https://your-app.netlify.app`) to `AllowedOrigins` when you deploy. CORS changes can take up to 30 seconds.

Download returns `null` on HTTP 404 (object not created yet).

### AWS S3 (`s3`)

| Variable | Purpose |
| --- | --- |
| `VITE_S3_REGION` | AWS region |
| `VITE_S3_ACCESS_KEY_ID` | IAM access key |
| `VITE_S3_SECRET_ACCESS_KEY` | IAM secret |
| `VITE_S3_BUCKET` | Bucket name |

Stub only (`NotImplementedError`).

### Supabase Storage (`supabase`)

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon (or dedicated) key |
| `VITE_SUPABASE_BUCKET` | Storage bucket |

Stub only.

### Google Drive (`gdrive`)

| Variable | Purpose |
| --- | --- |
| `VITE_GDRIVE_CLIENT_ID` | OAuth client id |
| `VITE_GDRIVE_CLIENT_SECRET` | OAuth client secret |
| `VITE_GDRIVE_REFRESH_TOKEN` | Long-lived refresh token |
| `VITE_GDRIVE_FOLDER_ID` | Optional parent folder |

Stub only.

## Unlock persistence flow

See `src/lib/vault/persist.ts`: download remote → load local → decrypt → `mergeVaults` (remote-wins stub) → write local cache → upload when remote was missing.
