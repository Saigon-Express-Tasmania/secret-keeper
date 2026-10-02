# Credentials Keep

Personal vault SPA for passwords, auth keys, wallets, TOTP seeds and secret
notes. Everything is encrypted in the browser (Argon2id + AES-256-GCM with
key slots); a single Netlify Function stores the ciphertext on Cloudflare R2
and enforces access: password proof, lockout and revision order.

Gates besides the master password: a Secret Key and a server-held key share
(no offline guessing), a Recovery Key, an authenticator app (TOTP), emailed
one-time sign-in links (optionally replacing the Secret Key on a new
device), passkeys or security keys (WebAuthn PRF), and 30-day trusted
devices. See [docs/security.md](docs/security.md).

The unlocked vault looks and works like macOS Finder: a window on a desktop with a menu bar, Icons / List / Columns views, Quick Look, Get Info, drag and drop, inline rename, Trash, and Finder keyboard shortcuts. It follows the system Light/Dark appearance. See [docs/screens.md](docs/screens.md).

## Stack

- Vite + React + TypeScript, Tailwind CSS + shadcn/ui, React Router
- `@noble/hashes` (Argon2id, HKDF, HMAC), WebCrypto (AES-GCM)
- Netlify Functions (`netlify/functions/vault.mts` → `server/`), `aws4fetch` for R2 (server only)
- Vitest

## Quick start (local, no cloud account needed)

```bash
npm install
npm run dev:api   # vault API on :8787, file store in .local/dev-store, setup code "dev"
npm run dev       # app on http://localhost:5173 (proxies /api to :8787)
```

Open the app → **Create a vault** → choose a name and a master password (12+
characters), enter the setup code `dev`, and save the **Emergency Kit** it
shows (Secret Key + Recovery Key). Emails (sign-in links, codes) are printed
in the `dev:api` terminal.

To use a real R2 bucket locally, fill `.env.local` (see below) and run
`npm run dev:api -- --r2`, or `npm run dev:netlify` for the full Netlify
emulation on http://localhost:8888.

## Production setup

1. **R2 bucket.** In Cloudflare: R2 → create a **private** bucket (no public
   access, no custom domain). Create an **R2 API token** with *Object Read &
   Write* scoped to that bucket. No CORS rule is needed: the browser never
   talks to R2.
2. **Brevo** (optional, for email links and notices): create a free account,
   verify a sender address, create an API key.
3. **Netlify.** Create a site from this repo. Under *Site settings →
   Environment variables* add, with scope **Functions** and context
   **Production**:

   | Variable | Value |
   | --- | --- |
   | `CK_SERVER_SECRET` | `openssl rand -base64 32` |
   | `VAULT_SETUP_CODE` | a long random code (needed to create vaults) |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | from step 1 |
   | `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | from step 2 |

4. Deploy, create your vault, then open **Keep → Security…** to add an
   authenticator app, an email address and passkeys.

Do **not** add `VITE_*` variables: Vite inlines them into the public bundle,
and the build refuses to run while one is set. Details and the migration from
the old version: [docs/deployment.md](docs/deployment.md).

## Importing data

```bash
npm run ck-file -- from-kdbx Database.kdbx            # KeePass
npm run ck-file -- from-legacy --vault vault          # old Credentials Keep vault (needs .env.legacy)
```

Both ask for passwords without echoing them, write an encrypted `.ckx` file
and print a one-time import key. In the app: Keep → Import Vault…

## Project layout

```text
src/screens/          Gate (unlock / create / recover) + Dashboard
src/components/       gate/, security/, dashboard/, editor/, ui/
src/context/          VaultContext (wraps a VaultSession; idle lock)
src/lib/vault/        vaultSession (client protocol), archive fs, import/export
src/lib/crypto/       kdf, key slots, CKV3 body, per-file AES-GCM, CKZ1 pack
src/shared/           isomorphic: CKV3 codec, API types, frames, vault names
server/               vault API: routes, verifiers, sessions, devices, lockout, backups, mail
netlify/functions/    Netlify adapter for server/
scripts/              ck-file (imports), dev-api, check-bundle, expand-icons
tests/                end-to-end protocol tests, import boundaries
docs/                 design docs + security audit
```

## Documentation

- [Security](docs/security.md) and [security audit](docs/security-audit.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Storage](docs/storage.md)
- [Screens](docs/screens.md)
- [Deployment](docs/deployment.md)

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server (proxies `/api` to `dev:api`) |
| `npm run dev:api` | Local vault API (file store; `-- --r2` for the bucket in `.env.local`) |
| `npm run dev:netlify` | `netlify dev`: Vite + Function on :8888 |
| `npm run build` | Typecheck + production build (fails if any `VITE_*` var is set) |
| `npm run check:bundle` | Scan `dist/` for storage hosts, signing code and secret names |
| `npm test` | Vitest (unit, server, end-to-end protocol) |
| `npm run lint` | oxlint |
| `npm run ck-file` | Build encrypted import files (KeePass, old vaults) |
