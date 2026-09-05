# Security

Credentials Keep is designed so that **storage providers never see plaintext secrets**. The master password and any decrypted file body live only in the browser session.

## Principles

1. **No app accounts** — unlock is the master password alone.
2. **Client-side crypto** — encrypt before upload; decrypt after download.
3. **Opaque blob** — providers store ciphertext bytes only.
4. **Per-file encryption** — after unlock, the explorer holds folder/file **names** and **file ciphertext**, not every secret in plaintext.
5. **Decrypt on open** — opening a file AES-GCM-decrypts that one body into viewer-local state; navigating away or Lock clears it.
6. **Lock clears memory** — payload, master password, file DEK refs, and open-file plaintext are dropped.

## Crypto

### Outer blob (CKV2)

Implemented in `src/lib/crypto/vault.ts` and `src/lib/crypto/pack.ts`.

| Step | Approach |
| --- | --- |
| Archive | Zip-like JSON tree (`VaultArchive` v3) |
| Pack | CKZ1: `deflate-raw` + reversible byte scramble (obscurity only) |
| Key derivation | Argon2id (`t=3`, `m=65536` KiB ≈ 64 MiB, `p=1`, 32-byte output) |
| Pepper | `VITE_VAULT_SALT_KEY` passed as Argon2 `key` (not written into the blob) |
| Salt | 16 random bytes per encrypt, stored in the blob header |
| Encryption | AES-256-GCM with 12-byte nonce; AAD = magic + format version |
| Blob format | `CKV2` + version + KDF id + salt + nonce + ciphertext+tag (plaintext = CKZ1) |

### Per-file (inside archive)

Implemented in `src/lib/crypto/file.ts`.

| Step | Approach |
| --- | --- |
| File DEK | Random 32-byte key stored in packed archive as `fileDek` (base64) |
| Session | DEK imported as non-extractable `CryptoKey`; **not** left on the React `payload` |
| File body | AES-256-GCM with unique nonce; tree stores `nonce` + `ciphertext` only |

Per-file encryption is defense in depth against accidental leaks (React DevTools dumping `payload`, logging the tree). A heap dump while unlocked can still reach the DEK and master password; Lock still clears both. Argon2id is **not** run per file (that would make open/save unusable).

Legacy `CKV1` blobs and archive v2 plaintext files still decrypt and migrate to v3 on unlock. New writes always use CKV2 + archive v3.

Wrong password or wrong env pepper fails GCM authentication and surfaces as **Invalid master password.**

The master password must never be sent to Netlify, R2, S3, Supabase, or Google Drive as part of vault unlock.

## Local replica

A ciphertext-only copy is kept in `localStorage` (`credentials-keep:vault:<objectKey>`). Unlock always tries to merge local and remote (stub currently prefers remote). Password and derived keys are never written to disk.

## Env credentials tradeoff

Vite embeds any `VITE_*` variable into the client bundle. That is convenient for scaffolding and matches “credentials in `.env`,” but **storage API secrets must not ship to end-user browsers** in production.

Recommended production shape:

```text
Browser ──► Netlify Function ──► Storage provider
              (server env secrets)
```

The browser still downloads ciphertext only; Functions hold provider keys. Until Functions exist, treat `.env` values as local/dev placeholders and never commit them (`.gitignore` excludes `.env`).

## Additional hardening (future)

- Auto-lock after idle timeout
- Optional clipboard clear after copy
- Warn when serving over non-HTTPS
- Integrity checks beyond GCM (e.g. separate MAC versioning)
- Item-level merge instead of remote-wins stub
