# Architecture

Credentials Keep is a small personal vault SPA. It stores encrypted secrets as a single blob on an external object store and unlocks them in the browser with a vault name plus master password. There are no user accounts and no server-side vault logic in the planned design.

## Goals

- Manage personal secrets: login passwords, auth keys, coin wallets, notes
- Minimal UX: two screens only (Gate and Dashboard)
- Host on Netlify as a static site
- Pluggable storage backends (R2, S3, Supabase, Google Drive, …)
- Mostly no login — vault name + master password is the unlock gate

## High-level flow

```text
Gate ──(vault name + master password)──► download vault blob (R2)
                         │   + load local ciphertext cache
                         ▼
                    decrypt CKV2 (Argon2id + AES-GCM + env pepper)
                         │   → unpack CKZ1 (unscramble + inflate)
                         │   (legacy CKV1 migrates to archive)
                         ▼
                    merge (stub: remote wins) ──► refresh local cache
                         │                       (+ upload if remote missing)
                         │                       (+ prefixed backup if due)
                         ▼
                    Dashboard (in-memory VaultArchive VFS)
                         │
                    Lock ──► clear memory ──► Gate
```

Storage is treated as a dumb blob store. The app never relies on the provider to understand vault contents. The decrypted shape is a nested folder/file JSON tree (see [data-model.md](./data-model.md)).

## Runtime pieces

| Piece | Role |
| --- | --- |
| Gate | Collect vault name + master password; download + decrypt + merge |
| Dashboard | Browse/create vault folders and files; decrypt-on-open account editor |
| `VaultContext` | In-memory archive + master password + object key; cleared on lock |
| `StorageStrategy` | Provider-specific download/upload/list/remove |
| `lib/vault/fs` | Zip-like archive tree helpers |
| `lib/crypto/pack` | CKZ1 compress + scramble |
| `lib/crypto/vault` | Argon2id + AES-GCM encrypt/decrypt (CKV2) |
| `lib/vault/persist` | Unlock orchestration |
| `lib/vault/backup` | Login-time prefixed copies of the live vault blob |
| `lib/storage/localCache` | Ciphertext replica in `localStorage` |

## Trust model (summary)

- Master password stays in the browser
- Vault ciphertext can live on any storage provider
- `VITE_VAULT_SALT_KEY` peppers key derivation and is never written into the blob
- Provider credentials are currently modeled as `VITE_*` env vars for scaffolding; production should prefer Netlify Functions so secrets are not embedded in the client bundle (see [security.md](./security.md))

## Out of scope (current)

- Real item-level merge
- Netlify Functions (documented only)
- Working S3 / Supabase / Drive adapters
- Searching inside encrypted file contents
