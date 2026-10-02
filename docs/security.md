# Security

Credentials Keep is designed so that **storage providers never see plaintext secrets**. The master password and any decrypted file body live only in the browser session.

## Principles

1. **No app accounts** — unlock is the vault name (object key) plus master password.
2. **Client-side crypto** — encrypt before upload; decrypt after download.
3. **Opaque blob** — providers store ciphertext bytes only.
4. **Per-file encryption** — after unlock, the explorer holds folder/file **names** and **file ciphertext**, not every secret in plaintext.
5. **Decrypt on open** — opening a file AES-GCM-decrypts that one body into viewer-local state; navigating away or Lock clears it.
6. **Opt-in previews** — the Finder only decrypts other files when **Show Credentials** is on (off by default), and then only the account files currently on screen (listing, search results, Column preview, Quick Look target). Turning it off drops those decrypted summaries. Trash items are never decrypted.
7. **Lock clears memory** — payload, master password, object key, file DEK refs, and open-file plaintext are dropped.

## Crypto

### Outer blob (CKV2)

Implemented in `src/lib/crypto/vault.ts` and `src/lib/crypto/pack.ts`.

| Step | Approach |
| --- | --- |
| Archive | Zip-like JSON tree (`VaultArchive` v3) |
| Pack | CKZ1: `deflate-raw` + reversible byte scramble (obscurity only) |
| Key derivation | Argon2id (`t=3`, `m=65536` KiB ≈ 64 MiB, `p=1`, 32-byte output), computed with `argon2idAsync` (same output as `argon2id`, but yields so the UI stays responsive) |
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

Changing the master password (Dashboard → Change password) re-wraps the outer CKV2 blob only; per-file bodies and the file DEK are unchanged. A failed upload keeps the previous session password.

The master password must never be sent to Netlify, R2, S3, Supabase, or Google Drive as part of vault unlock.

## Session safety in the UI

- **One save at a time.** `commit()` is single-flight and always starts from the latest committed archive; a second save while one is running is refused, and the Finder disables vault-changing commands meanwhile. Overlapping saves can't silently drop a change.
- **Lock wins.** `lock()` bumps a session counter; a save that completes after locking is discarded instead of putting the archive back into React state. The Finder's Lock (red traffic light / menu) waits for a save in flight, then locks.
- **Edited files first.** Moving, renaming or trashing a folder that contains the open, edited account asks Save / Don't Save / Cancel before the change, so a later save can't recreate the old path.
- **No names leak into browser state.** Vault paths never appear in the URL, page title, `localStorage` prefs (`ck:finder` holds layout only), or drag-and-drop data (drags carry an opaque marker; paths stay in page memory). Cut/Copy/Paste of items uses an in-app clipboard. The explicit copy buttons for usernames, passwords and codes do write to the system clipboard.

## Local replica

A ciphertext-only copy is kept in `localStorage` (`credentials-keep:vault:<objectKey>`). Unlock always tries to merge local and remote (stub currently prefers remote). Password and derived keys are never written to disk.

## External icon URLs

A file or folder icon can be an external image URL instead of a built-in catalog icon (`src/lib/icons/external.ts`). Vault data (including an imported vault) is untrusted, so these rules apply:

- **HTTPS only.** `parseExternalIconUrl` accepts only absolute `https:` URLs with a host. It rejects `javascript:`, `data:`, `blob:`, `file:`, `http:` and every other scheme, as well as embedded credentials (`user:pass@`), whitespace or control characters, and anything over 2048 characters. The same check runs when an icon is written (`mkdir`, `putFile`, `setNodeIcon`) and again on **every render** (`NodeIcon`). An invalid value falls back to the default icon.
- **`<img>` only.** The URL is only ever used as the `src` of a plain `<img>` (`referrerPolicy="no-referrer"`, lazy). Browsers render image documents, SVG included, in secure static mode: no script runs, no sub-resources load, and the content can't touch the page. The app never `fetch()`es the URL or injects its content as markup, and never puts it in `<object>`, `<embed>`, `<iframe>`, CSS or Iconify. A broken or non-image response falls back to the default icon.
- **CSP.** `netlify.toml` sends a Content-Security-Policy with `script-src 'self'`, `object-src 'none'`, `frame-src 'none'` and `base-uri 'none'`. Even if a future bug rendered a URL somewhere unsafe, external scripts, plugins and frames would still be blocked. `img-src` allows `https:` so icons can load. `connect-src` is limited to the app origin and `*.r2.cloudflarestorage.com`; extend it if another storage adapter is enabled.
- **Privacy tradeoff.** External images are hotlinked, not stored in the vault. Each time one is shown, the image host can see your IP address and when you viewed the vault, and the browser may send that host's own cookies. Built-in icons stay fully offline.

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
