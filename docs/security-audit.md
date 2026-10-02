# Security audit — encryption and vault handling

**Scope.** Everything that touches vault secrets: key derivation and blob format
(`src/lib/crypto/*`), unlock/save orchestration (`src/lib/vault/*`,
`src/context/VaultContext.tsx`), storage and local cache (`src/lib/storage/*`),
the editor/OTP/clipboard UI, the KeePass import CLI, build/deploy config and the
design docs.

**Method.** Line-by-line code review against the threat model below; no
dynamic testing of a deployed instance. Each finding cites the code it was
verified in. Status is updated as the remediation phases land (see the end).

## Threat model

| Actor | Can do | Must not be able to |
|---|---|---|
| Anyone on the internet | Load the site, read the JS bundle, call any public endpoint | Read, change, delete or brute-force any vault |
| Storage provider / leaked bucket | Read and write the stored objects | Decrypt a vault, or roll it back undetected |
| Someone who learned the master password | Use it from their own machine | Open the vault without the other factors |
| Thief of an unlocked or trusted device | Use the browser profile | Get more than rate-limited online guesses; keep access after idle lock |
| The person who runs the deployment | Change the code that is served | — (out of scope: a web-delivered vault trusts its host) |

## Summary

The cryptographic primitives are well chosen and correctly used: Argon2id
(t=3, m=64 MiB, p=1), AES-256-GCM with a fresh random salt **and** nonce on
every encryption (so a new key per save and no nonce reuse), and a per-file
data key held as a non-extractable `CryptoKey`.

The weaknesses are in the system around them. Every secret meant to protect a
vault — except the master password — is compiled into the public JavaScript
bundle, so the storage bucket is world-readable and world-writable and every
vault can be brute-forced offline. There is also no rollback protection, no
session hygiene (the password lives in React state, no auto-lock, no clipboard
clearing), no password policy, and no browser security headers.

## Findings

| ID | Severity | Title | Status |
|---|---|---|---|
| F1 | Critical | Storage credentials are public | Open — Phase 4 |
| F2 | Critical | The Argon2 pepper is public; password is the only offline barrier | Open — Phase 4 |
| F3 | High | No password policy; a typo silently creates a vault | Open — Phase 4 |
| F4 | High | Rollback and substitution of vault blobs | Open — Phase 4 |
| F5 | High | Master password kept for the whole session | Partly fixed (Phase 1: off the context value) — Phase 4 |
| F6 | High | No auto-lock, clipboard never cleared | **Fixed** — Phase 1 |
| F7 | High | No CSP or security headers | **Fixed** — Phase 1 |
| F8 | Medium | Ciphertext cache never cleared | Open — Phase 4 |
| F9 | Medium | Password change leaves old copies openable | Open — Phase 4 |
| F10 | Medium | KDF parameters not agile; no Unicode normalization | Open — Phases 3, 4 |
| F11 | Medium | Exports protected only by the master password | Open — Phase 4 |
| F12 | Medium | KDBX importer leaks the password and overwrites the vault | Open — Phase 4 |
| F13 | Low | Password generator modulo bias | **Fixed** — Phase 0 |
| F14 | Low | Unbounded decompression (zip bomb) | **Fixed** — Phase 0 |
| F15 | Info | Per-file AES-GCM has no AAD | Accepted (rationale below) |
| F16 | Low | Blob size and vault names visible to the provider | Open — Phase 4 |
| F17 | Low | Errors classified by message text | Open — Phase 4 |
| F18 | Low | Build not pinned to the lockfile | **Fixed** — Phase 0 |

### F1 — Storage credentials are public (Critical)

`src/lib/storage/adapters/r2.ts:35-53` reads `VITE_R2_ACCESS_KEY_ID` and
`VITE_R2_SECRET_ACCESS_KEY`. Vite inlines every `VITE_*` variable into
`dist/assets/*.js`, so anyone who opens the site can copy the keys. The token
has Object Read & Write on the bucket and the documented CORS policy allows
`PUT` and `DELETE`, so an outsider can:

- list every object, which reveals every vault name (half of the unlock gate);
- download every vault and every `bak-*` backup for offline attack (see F2);
- overwrite or delete every vault **and its backups**, which live in the same
  bucket under the same key. The only surviving copy is whatever a browser
  cached locally.

The docs call this a scaffolding trade-off, but it is how the app is built and
deployed. **Treat the current token as leaked and rotate it.**

### F2 — The pepper is public (Critical)

`src/lib/crypto/vault.ts:59-67` reads `VITE_VAULT_SALT_KEY` and passes it as
the Argon2 secret (`vault.ts:91-94`). It is inlined into the bundle like F1, so
it adds no secrecy. With F1, anyone can fetch a vault and guess passwords
offline at the cost of one Argon2id(64 MiB, t=3) per guess, which is cheap
against weak passwords (see F3). The pepper has no identifier in the blob
header, so it can never be rotated without bricking every vault.

### F3 — No password policy; typos create vaults (High)

`src/lib/vault/persist.ts:68-78`: when neither a remote nor a local blob
exists, unlock creates an empty vault, encrypts it with whatever was typed
(even one character) and uploads it. A mistyped vault name therefore creates a
new vault instead of failing, and nothing stops weak master passwords.
`ChangeMasterPasswordDialog.tsx:49-60` likewise only checks that the new
password is non-empty.

### F4 — Rollback and substitution (High)

- `src/lib/vault/merge.ts:21-34` always prefers the remote copy, and
  `persist.ts:91-93` then overwrites the local cache with it.
- Backups are byte copies of the live blob, encrypted under the same password.
- The AES-GCM AAD (`vault.ts:69-78`) covers only magic and format version;
  there is no vault identity or revision counter anywhere.

With write access (F1), an attacker can copy any older backup over the live
object. It decrypts normally, the user silently loses newer data (or gets back
credentials they had rotated), and the newer local copy is destroyed by the
remote-wins merge. Two vaults sharing a password can also be swapped.

### F5 — Master password kept for the whole session (High)

`src/context/VaultContext.tsx:70` stores the password string in React state
and `:244` exposes it on the context value, where any component, extension or
DevTools session can read it. Every save re-derives the key from it
(`persist.ts:114-128`), which also means a 64 MiB Argon2 run on the main
thread per save.

### F6 — No auto-lock, clipboard never cleared (High)

An unlocked vault stays unlocked until the tab closes. `CopyButton.tsx`
writes passwords, recovery codes and OTP codes to the clipboard and never
clears them, so they persist in the clipboard and in OS clipboard history.

### F7 — No CSP or security headers (High)

`netlify.toml` sets no headers. There is no `Content-Security-Policy` to limit
where scripts load from or where data can be sent, no `frame-ancestors` (the
reveal and copy buttons can be clickjacked), and no `nosniff`,
`Referrer-Policy` or HSTS. For a password manager, a strict CSP is the main
damage limiter against injected script.

### F8 — Ciphertext cache never cleared (Medium)

`src/lib/storage/localCache.ts` keeps `credentials-keep:vault:<name>` in
`localStorage` forever. `clearLocalVault()` exists but is never called, so
there is no way to forget a device. Anyone with the browser profile gets the
vault name plus ciphertext, and with the public pepper (F2) can brute-force it
offline. A vault of a few megabytes would also exceed the browser's
`localStorage` quota (base64 adds a third), making unlock throw.

### F9 — Password change leaves old copies openable (Medium)

`VaultContext.tsx:167-206` re-encrypts the outer blob under the new password
only. Backups (kept 7 days by default), other devices' caches and old exports
still open with the old password, and the file DEK inside them is the same one
still in use. Changing a leaked password does not protect existing copies.

### F10 — KDF not agile; no normalization (Medium)

Argon2 parameters are hard-coded (`vault.ts:45-50`) and not recorded in the
blob header (only a KDF id), so they can never be raised without a new format.
Argon2 runs synchronously on the main thread (`vault.ts:91`), freezing the UI
and discouraging stronger settings. The password is not Unicode-normalized, so
the same visible password typed on two systems can produce different bytes.

### F11 — Exports protected only by the master password (Medium)

`src/lib/vault/transfer.ts:46-52` encrypts `.ckv` exports with the master
password and the public pepper. An export that leaves the device is a
brute-forceable copy of the whole vault.

### F12 — KDBX importer (Medium)

`scripts/import-kdbx.ts` documents `KDBX_PASSWORD=... npm run import-kdbx`,
which records the password in shell history. It reuses the KeePass password
as the vault master password and uploads with the R2 keys, replacing the
remote vault.

### F13 — Password generator modulo bias (Low) — fixed

`PasswordGenerator.tsx` mapped random bytes with `byte % 87`; the first 82
characters were 1.5× as likely as the last 5. Generation now uses rejection
sampling (`src/lib/security/password.ts`, tested in `password.test.ts`).

### F14 — Unbounded decompression (Low) — fixed

`unpackArchive` inflated everything before comparing with the declared length,
so a crafted import file could exhaust memory. `pack.ts` now rejects declared
lengths above 32 MiB and stops inflating as soon as output exceeds the
declared length (tested in `pack.test.ts`).

### F15 — Per-file AES-GCM has no AAD (Info, accepted)

`src/lib/crypto/file.ts:61-96` encrypts each file without associated data, so
file ciphertexts could be swapped between paths. They only ever exist inside
the outer, authenticated vault body or in memory, so swapping them already
requires the outer key. No change; documented.

### F16 — Metadata visible to the provider (Low)

The blob length reveals roughly how much is stored, and object keys are the
vault names in plain text.

### F17 — Errors classified by message text (Low)

`vault.ts:230-241` decides which errors to surface by substring-matching
`err.message`. A wording change can turn a structural error into "Invalid
master password." or the reverse. Typed error codes are more robust.

### F18 — Build not pinned to the lockfile (Low) — fixed

`netlify.toml` now runs `npm ci` (exact versions and integrity hashes from
`package-lock.json`) and pins Node 22.

### Dependency note

`kdbxweb@2.1.1` (dev dependency, KeePass import CLI only) pulls in
`@xmldom/xmldom@0.7.13`, a deprecated line with known parser issues. It is
never shipped to the browser and only parses the user's own KeePass file;
keep it out of any server or browser code path.

## Verified sound

- Fresh random 16-byte salt and 12-byte nonce on every outer encryption: a new
  key per save, so GCM nonce reuse is impossible.
- Argon2id t=3, m=64 MiB, p=1 meets the OWASP minimums.
- Header tampering fails authentication: salt and nonce feed the key and IV,
  version and KDF id are checked, magic and version are in the AAD.
- Wrong password and wrong pepper are indistinguishable (no oracle).
- The file DEK is imported as a non-extractable `CryptoKey`; per-file nonces
  are random 96-bit values, far below the 2^32-messages-per-key guidance.
- Per-file encryption happens before outer compression, so a compression
  side channel could only reveal metadata such as names, never secrets.
- The editor only links `http:`/`https:` URLs, with `noopener noreferrer`.
- Icons are vendored (no CDN requests); QR codes are encoded and decoded locally.
- `.env*` and `.local/` are git-ignored.

## Remediation plan

| Phase | Fixes | Content |
|---|---|---|
| 0 | F13, F14, F18 | Test harness, generator, bounded inflate, `npm ci`, this report |
| 1 | F5 (partial), F6, F7 | Clipboard auto-clear, idle lock, CSP and headers |
| 2–3 | — | Server foundation, new vault format (CKV3) |
| 4 | F1–F5, F8–F12, F16, F17 | Netlify Function proxy with per-vault auth, CKV3 with key slots, Secret Key, Recovery Key, rollback protection, safe export and import |
| 5–7 | — (new gates) | TOTP, trusted devices, email link, passkeys |
| 8 | — | Key rotation, final documentation |
