# Deployment (Netlify)

Credentials Keep is a static Vite SPA plus one Netlify Function (the vault
API). Both deploy from this repository.

## Config

[`netlify.toml`](../netlify.toml):

- Build: `npm ci && npm run build` (exact lockfile versions), Node 22, publish `dist`
- SPA fallback: `/*` → `/index.html` (200). Function routes (`/api/vault/*`) take precedence.
- Headers for every page: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP, HSTS. The script/style/connect
  CSP is injected into `index.html` at build time (see `vite.config.ts`).
- `[dev]`: `netlify dev` runs Vite and the Function together on port 8888.

The Function (`netlify/functions/vault.mts`) declares its own path
(`/api/vault/*`), allowed methods, and a free edge rate limit (60 requests per
minute per IP). It sets `Cache-Control: no-store` and its own security headers.

## Environment variables

Set these under **Site settings → Environment variables**, with scope
**Functions** and context **Production** only. Deploy previews and branch
deploys otherwise receive the production values; if you use previews, give
them a separate dev bucket.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CK_SERVER_SECRET` | yes | ≥32 random bytes (`openssl rand -base64 32`); verifiers, sessions, sealing |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | yes | R2 token scoped to the bucket (Object Read & Write) |
| `R2_ENDPOINT` | no | Jurisdictional S3 API host |
| `VAULT_SETUP_CODE` | to create vaults | Long random code typed when creating a vault; unset disables creation |
| `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | for email | Brevo transactional email; `MAIL_FROM` must be a verified sender |
| `VAULT_BACKUP_INTERVAL_HOURS`, `VAULT_BACKUP_RETENTION_DAYS` | no | Defaults 8 and 7 |
| `PUBLIC_SITE_URL` | no | Overrides Netlify's `URL` for links in emails |

**No `VITE_` variables.** Anything with that prefix is inlined into the public
JS bundle, so `vite.config.ts` refuses to build while one is set. After a
build, `npm run check:bundle` greps `dist/` for storage hosts, request
signing code and secret names.

## Cost (free tiers)

- Unlock: `prelogin` + `unlock` (2 invocations, ~3 R2 reads). Save: 1 invocation
  (HEAD + PUT, plus a CopyObject when a backup is due). No polling.
- Argon2 runs in the browser, never in the Function.
- Email: a few messages per sign-in link or security change (Brevo free tier: 300/day).
- Each production deploy uses Netlify credits; batch changes.

## Local preview of the production build

```bash
npm run build && npm run check:bundle
npm run dev:api        # vault API on :8787 with a local file store
npx vite preview       # serves dist/ with the CSP; proxies /api to :8787
```

## Migrating from the old version

The old app kept the R2 keys and the Argon2 pepper in `VITE_*` variables, so
they are public in every bundle that was ever deployed. Migrate once:

1. **Export the old vault to an import file.** Put the old values in
   `.env.legacy` (not `.env.local`):
   `VITE_VAULT_SALT_KEY`, `VITE_R2_ACCOUNT_ID`, `VITE_R2_ACCESS_KEY_ID`,
   `VITE_R2_SECRET_ACCESS_KEY`, `VITE_R2_BUCKET`. Then run
   `npm run ck-file -- from-legacy --vault <old name>` (or `--file old.enc` / an old
   `.ckv` export). It asks for the old master password, writes `<name>.ckx` and
   prints a one-time import key.
2. **Create a new R2 API token** scoped to the bucket and set the server
   variables above in Netlify (Functions scope, Production context). Deploy.
3. **Create the vault** on the Gate with a **new** master password and the setup
   code; save the Emergency Kit.
4. **Import**: Keep menu → Import Vault…, choose the `.ckx`, paste the import key, tick
   "Merge into the top level". Then enable a second factor (Security).
5. **Clean up:**
   - revoke the old R2 token in Cloudflare;
   - delete every `VITE_*` variable in Netlify;
   - remove the bucket's CORS rule (the browser no longer calls R2);
   - delete the old `{name}.enc` and `bak-{name}.enc-*` objects, old `.ckv`
     exports, the `.ckx` file and `.env.legacy`;
   - if the old master password was weak, change the passwords stored in the
     vault: the old blobs were downloadable by anyone and protected only by
     that password.
