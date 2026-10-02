# Storage

The browser never talks to the storage provider. It calls the vault API
(`/api/vault/*`, a Netlify Function), and only the Function holds storage
credentials. Storage is a dumb object store; it only ever sees ciphertext and
sealed metadata.

```text
Browser ──HTTPS──► /api/vault/* (netlify/functions/vault.mts → server/) ──S3 API──► R2 bucket
```

## Object store interface

`server/store.ts`:

```ts
interface ObjectStore {
  head(key): Promise<{ etag, size, meta } | null>
  get(key): Promise<{ etag, size, meta, body } | null>
  put(key, body, { ifMatch?, ifNoneMatch?: "*", meta? }): Promise<{ etag }> // 412 → PreconditionFailedError
  copy(sourceKey, destinationKey): Promise<void> // keeps metadata
  list(prefix): Promise<string[]>
  delete(key): Promise<void>
}
```

Implementations:

| Store | File | Used by |
| --- | --- | --- |
| Cloudflare R2 (S3 API, SigV4 via `aws4fetch`) | `server/r2Store.ts` | Production Function, `dev:api -- --r2`, `ck-file from-legacy --vault` |
| In-memory | `server/memoryStore.ts` | Tests |
| Local files (`.local/dev-store`) | `scripts/lib/fileStore.ts` | `npm run dev:api` |

All writes that matter are compare-and-swap (`If-Match` / `If-None-Match`),
which R2 supports on PutObject.

## Bucket layout

Vault names are `a-z 0-9 -` (1–48 chars), so these prefixes never collide:

| Key | Content |
| --- | --- |
| `vaults/{name}.enc` | CKV3 vault blob (see [data-model.md](./data-model.md)) + auth record in custom metadata |
| `meta/{name}.json` | Server-side gate state (lockout, TOTP, email, link tokens, trusted devices) |
| `backups/{name}/{yyyyMMddTHHmmssZ}.enc` | Earlier versions of the vault blob, with their metadata |

### Auth record (vault object metadata)

Written in the same PUT as the blob, so a password change swaps slots and
verifier atomically:

| Key | Meaning |
| --- | --- |
| `ck` | `3` |
| `vid`, `rev` | Vault id and revision (match the CKV3 header) |
| `kdf` | Argon2id parameters + salt, returned by `prelogin` |
| `sh` | Hash of the header's slots/KDF/passkeys; changing it requires a re-key |
| `av`, `rv` | `HMAC(k_ver, vaultId ‖ authKey)` and the same for the Recovery Key |
| `sp`, `se` | Server shares P (primary slot) and E (email slot), AES-GCM-sealed with a key derived from `CK_SERVER_SECRET` |
| `ae` | Auth epoch; bumped by every re-key (ends all sessions) |
| `bk`, `pr` | Last backup / last prune (unix seconds) |

### `meta/{name}.json`

Lockout counters, sealed TOTP secret and last used step, sealed email
address (and pending address + hashed verification code), hashed sign-in
link tokens, trusted devices (hashed cookie secret, label, expiry, failure
count) and a mail-send log. Updated only by compare-and-swap with retries.

## Backups

Before overwriting the vault the Function copies the current object to
`backups/{name}/{timestamp}.enc` when the last backup is older than
`VAULT_BACKUP_INTERVAL_HOURS` (default 8; `0` disables), and always before a
re-key. CopyObject keeps the metadata, so a backup carries the verifiers and
sealed shares that match it. At most once a day, backups older than
`VAULT_BACKUP_RETENTION_DAYS` (default 7) are deleted, always keeping the
newest three.

**Restoring a backup** (manual): copy `backups/{name}/{ts}.enc` over
`vaults/{name}.enc` in the R2 dashboard (the copy keeps its metadata). It
opens with the password, Secret Key and second factors that were current at
that time. Trusted devices that saw a newer revision will warn about a
rollback; confirm it on the Gate.

## Local development

* `npm run dev:api` serves the same handler on `http://localhost:8787` with a
  file store in `.local/dev-store` (override with `CK_DEV_STORE`); Vite
  proxies `/api` to it. A missing `CK_SERVER_SECRET` is generated into the
  store directory; a missing `VAULT_SETUP_CODE` defaults to `dev`.
* `npm run dev:api -- --r2` uses the R2 bucket from `.env.local` instead.
* `npm run dev:netlify` runs `netlify dev` (Vite + the Function on port 8888)
  and needs R2 settings.

## Legacy layout (before CKV3)

Older builds stored `{name}.enc` (CKV2) at the bucket root and
`bak-{name}.enc-{timestamp}` copies, written directly from the browser. Those
objects are only read by `npm run ck-file -- from-legacy --vault {name}`
(credentials from `.env.legacy`). Delete them after migrating; see
[deployment.md](./deployment.md#migrating-from-the-old-version).
