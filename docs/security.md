# Security

Credentials Keep encrypts everything in the browser. The server (one Netlify
Function) stores ciphertext and enforces who may fetch it; the storage
provider only ever sees ciphertext and sealed metadata. The findings that
shaped this design are in [security-audit.md](./security-audit.md).

## Threat model

| Adversary | Has | Protection |
| --- | --- | --- |
| Anyone on the internet | The public JS bundle; can call the API | No secrets in the bundle; API needs a password proof, a second factor off-device, and is rate-limited and locked out after repeated failures |
| Storage leak (R2 bucket, backups) | Every object and its metadata | Every blob needs the Secret Key (or the email share, sealed with a key R2 never sees) besides the password; verifiers are keyed HMACs |
| Someone who learned the master password | The password | Also needs the Secret Key (or the email link), plus TOTP when enabled |
| Thief of a trusted device / browser profile | Secret Key + device cookie | Still needs the password; guesses are online only (P is server-held), and the device is revoked after 5 failures |
| Passer-by at an unlocked session | The open tab | Idle auto-lock, lock on `pagehide`, clipboard auto-clear, password re-entry for every security change |
| Whoever controls the Netlify site | The code users run | Out of scope: a web-delivered vault trusts the code it is served |

## Gates

| Gate | Kind | Required when |
| --- | --- | --- |
| Master password | Cryptographic (Argon2id → pwKey) + server proof (authKey) | Always |
| Secret Key `SK1-…` | Cryptographic, 128-bit | Daily unlock (remembered on trusted devices) |
| Server share P | Cryptographic, held by the server | Every password unlock — makes offline guessing impossible |
| Recovery Key `RK1-…` | Cryptographic, 256-bit | Break-glass alternative to all of the above |
| Trusted device (30 days) | Access control (cookie) + local Secret Key | Skips the second factor; expires after a fixed 30 days |
| Lockout | Access control | Failures 1–5 free, then `min(2^(n-6) min, 4 h)` |

Additional gates (authenticator-app TOTP, email sign-in link, passkey) are
described below as they are enabled.

## Cryptography

See [data-model.md](./data-model.md) for byte layouts.

- **KDF.** Argon2id (`m=64 MiB, t=3, p=1`), NFKC-normalized password, one run
  per unlock, split with HKDF into `authKey` (sent) and `pwKey` (kept).
  Parameters live in the header so they can be raised later; decoding enforces
  bounds. There is no pepper: the old `VITE_VAULT_SALT_KEY` was public.
- **Key slots.** A random vault key VK is wrapped (AES-256-GCM, AAD bound to
  slot type and vault id) by a KEK derived with one HKDF over the fixed-length
  concatenation of the slot's factors: primary = password key ‖ Secret Key ‖
  server share P; recovery = Recovery Key.
- **Body.** AES-256-GCM under `HKDF(VK)`; the whole header is the AAD, so any
  header change makes the body fail to open. Plaintext is padded to 16 KiB.
- **Files.** Each file is AES-256-GCM under a random file DEK stored in the
  body; bodies decrypt only when opened. Per-file AAD is not used: file
  ciphertexts only exist inside the authenticated body (audit F15).
- **Re-keying.** Changing the password, Secret Key or Recovery Key re-wraps
  the slots and always mints a new server share, so every older blob, backup
  or cached copy stops opening (the server no longer releases the old share).
  "Rotate all keys" also replaces VK and the file DEK.
- **Key commitment.** AES-GCM is not key-committing; a malicious server could
  in theory craft a slot that opens under two keys, but it already sees the
  authKey, so it gains nothing it could not get by guessing passwords.

## Server rules

- **Verifiers.** `HMAC(k_ver, kind ‖ vaultId ‖ authKey)` in the vault object's
  metadata; constant-time comparison.
- **Enumeration.** `prelogin` returns stable fake parameters for unknown names
  and `unlock` answers them like a wrong password, without writing anything.
  (Response timing may still differ slightly.)
- **Sessions.** Stateless HMAC tokens (12 h) sent as a Bearer header, bound to
  vault name, vault id and auth epoch. Every re-key bumps the epoch, ending all
  other sessions.
- **Saves.** `If-Match` compare-and-swap; the revision must be exactly
  previous + 1, the vault id unchanged, and the slot structure unchanged unless
  the request is a re-key with step-up proof (password or Recovery Key).
- **Requests.** Same origin only (`Origin`, `Sec-Fetch-Site`), a custom header,
  typed content types, size caps, no CORS headers, `Cache-Control: no-store`.
- **Rate limits.** Netlify edge limit (60 requests/min per IP) plus per-vault
  lockout stored in `meta/{name}.json` with compare-and-swap, so parallel
  guesses cannot exceed it.
- **Vault creation** requires `VAULT_SETUP_CODE`.
- **Backups** are made server-side before overwrites; see [storage.md](./storage.md).

## Browser hardening

- Strict CSP (`default-src 'none'`, scripts and connections to self only),
  `frame-ancestors 'none'`, `nosniff`, `no-referrer`, COOP, HSTS.
- The build fails if any `VITE_*` variable is set; `npm run check:bundle`
  scans `dist/` for storage hosts, request signing and secret names.
- No ciphertext cache: the old `localStorage` vault copies are purged at
  startup. A trusted device stores only the Secret Key and the highest revision
  seen (rollback detection), for 30 days.
- Session keys live outside React state and are wiped on lock; the master
  password is not kept after unlock.
- Copied secrets are wiped from the clipboard after 30 s.

## Residual risks

- **Hosting compromise.** Whoever can change the deployed site can serve code
  that captures passwords. Use a strong Netlify account (2FA) and review deploys.
- **Recovery Key.** It alone opens any copy of the vault. Keep it offline.
- **Clipboard history.** OS clipboard history or sync may keep copies.
- **Timing.** Response latency may hint whether a vault name exists.
- **Old copies.** Blobs from before the migration were readable by anyone with
  the bundle; if the old password was weak, rotate the credentials inside.
