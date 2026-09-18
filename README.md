# Credentials Keep

Personal vault SPA for passwords, auth keys, wallets, and secret notes. Hosted as a static Netlify app with a pluggable storage backend. The vault is a zip-like JSON archive (folders + JSON files), compressed (CKZ1) and encrypted client-side (Argon2id + AES-GCM / CKV2). R2 download/upload is implemented; other adapters are stubs.

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- React Router (Gate `/`, Dashboard `/dashboard`)
- `@noble/hashes` (Argon2id), `aws4fetch` (R2 SigV4)

## Quick start

```bash
npm install
cp .env.example .env.local
# Then complete Cloudflare R2 setup below
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Unlock with a vault name (e.g. `vault`) and master password — the Gate downloads or creates `{name}.enc` on R2 and keeps a local ciphertext replica.

## Cloudflare R2 setup

The app talks to R2 through the **S3-compatible API** (`https://<account_id>.r2.cloudflarestorage.com`) with signed browser requests. Keep the bucket **private**. Do not enable public access or use an `r2.dev` URL — `VITE_R2_ENDPOINT` is ignored unless it is the S3 API host.

You need: a Cloudflare account with R2 enabled, a bucket, an R2 API token, a CORS policy, and a long random Argon2 pepper.

### 1. Enable R2

1. Open the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Go to **Storage & databases → R2 → Overview**.
3. Complete the R2 checkout if prompted (R2 has a free usage tier).

### 2. Create a private bucket

1. **Create bucket**. Name it with lowercase letters, numbers, and hyphens only (3–63 characters), e.g. `credentials-keep`.
2. Leave location as the default unless you need a jurisdiction (EU / US / FedRAMP). Jurisdictional buckets need a different API host — see [Optional endpoint](#optional-endpoint).
3. Do **not** connect a custom domain or enable public access. The app authenticates with the API token.

### 3. Create an R2 API token

Use an **R2 API token**, not a generic Cloudflare API token.

1. On **R2 → Overview**, under **Account details**, select **Manage** next to **API Tokens**.
2. Create an **Account API token** or **User API token**.
3. Permission: **Object Read & Write** (read, write, list, delete). Scope it to this bucket if asked.
4. Create the token and copy both values immediately — the secret is shown once:
   - **Access Key ID** → `VITE_R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `VITE_R2_SECRET_ACCESS_KEY`
5. Copy **Account ID** from the same R2 overview **Account details** panel → `VITE_R2_ACCOUNT_ID`.

### 4. Set the CORS policy

Origins alone are not enough. The client (`aws4fetch`) sends `Authorization`, `x-amz-date`, and `x-amz-content-sha256`, so the browser sends an OPTIONS preflight. If those headers are missing from `AllowedHeaders`, R2 returns `403 CORS not configured for this bucket` and Chrome reports a CORS error.

1. Open the bucket → **Settings → CORS Policy**.
2. Use the **JSON** tab (not only the origins list).
3. Paste this policy. Origins must be exact `scheme://host:port` — include `http://`, no trailing slash:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://localhost:5174"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"],
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

4. Save. Changes can take up to 30 seconds.

When you deploy, add the production origin (e.g. `https://your-app.netlify.app`) to `AllowedOrigins`. `DELETE` is required for login-time backup retention; `PUT` is required to create and update vault blobs.

### 5. Fill `.env.local`

```bash
cp .env.example .env.local
```

Set at least:

```bash
VITE_STORAGE_PROVIDER=r2
VITE_VAULT_SALT_KEY=          # long random string; keep stable or existing vaults will not unlock
VITE_R2_ACCOUNT_ID=
VITE_R2_ACCESS_KEY_ID=
VITE_R2_SECRET_ACCESS_KEY=
VITE_R2_BUCKET=               # exact bucket name from step 2
```

Generate a pepper, for example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Leave `VITE_R2_ENDPOINT` empty unless you created a jurisdictional bucket.

Optional backup knobs (defaults are fine): `VITE_VAULT_BACKUP_PREFIX` (`bak-`), `VITE_VAULT_BACKUP_INTERVAL_HOURS` (`8`; `0` disables), `VITE_VAULT_BACKUP_RETENTION_DAYS` (`7`).

Restart `npm run dev` after changing env vars. Every `VITE_*` value is inlined into the client bundle — do not commit `.env.local`, and do not treat these keys as production-safe in a public site. See [docs/security.md](docs/security.md).

### Optional endpoint

Default API host (used automatically):

`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

Jurisdictional buckets must use the matching host in `VITE_R2_ENDPOINT`:

| Jurisdiction | `VITE_R2_ENDPOINT` |
| --- | --- |
| European Union | `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` |
| United States | `https://<ACCOUNT_ID>.us.r2.cloudflarestorage.com` |
| FedRAMP | `https://<ACCOUNT_ID>.fedramp.r2.cloudflarestorage.com` |

A `pub-….r2.dev` or custom-domain URL will be ignored.

### Check that it works

1. `npm run dev` and open `http://localhost:5173`.
2. Unlock with vault name `vault` and a new master password.
3. In the R2 dashboard the bucket should show `vault.enc` after the first successful unlock (created if it did not exist).
4. If the console shows a CORS / `net::ERR_FAILED` error on `*.r2.cloudflarestorage.com`, the preflight headers or methods in step 4 are still wrong — not the origin list. Details: [docs/storage.md](docs/storage.md).

## Project layout

```text
docs/                 Design docs
src/screens/          Gate + Dashboard
src/context/          Vault unlock state
src/lib/storage/      StorageStrategy + R2 adapter + local cache
src/lib/crypto/       CKZ1 pack + Argon2id / AES-GCM (CKV2)
src/lib/vault/        VFS archive + unlock persist + merge stub
src/components/ui/    shadcn components
netlify.toml          Netlify SPA config
.env.example          Storage + pepper env placeholders
```
## Documentation

- [Architecture](docs/architecture.md)
- [Screens](docs/screens.md)
- [Storage](docs/storage.md)
- [Security](docs/security.md)
- [Data model](docs/data-model.md)
- [Deployment](docs/deployment.md)

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Lint with oxlint |
