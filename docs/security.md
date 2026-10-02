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
| Someone who learned the master password | The password | Also needs the Secret Key (or, with email unlock, the mailbox), plus TOTP when enabled |
| Someone who controls the mailbox | Sign-in links | Still needs the password; with email unlock off also the Secret Key; plus TOTP when enabled |
| Thief of a trusted device / browser profile | Secret Key + device cookie | Still needs the password (and a passkey touch when required); guesses are online only (P is server-held), and the device is revoked after 5 failures |
| Passer-by at an unlocked session | The open tab | Idle auto-lock, lock on `pagehide`, clipboard auto-clear, password re-entry for every security change |
| Whoever controls the Netlify site | The code users run | Out of scope: a web-delivered vault trusts the code it is served |

## Gates

| Gate | Kind | Required when |
| --- | --- | --- |
| Master password | Cryptographic (Argon2id → pwKey) + server proof (authKey) | Always |
| Secret Key `SK1-…` | Cryptographic, 128-bit | Daily unlock (remembered on trusted devices) |
| Server share P | Cryptographic, held by the server | Every password unlock — makes offline guessing impossible |
| Recovery Key `RK1-…` | Cryptographic, 256-bit | Break-glass alternative to all of the above |
| Authenticator app (TOTP) | Access control, server-enforced | Every unlock on a device that is not trusted, once enabled |
| Email sign-in link | Access control (one-time token) | Second factor on untrusted devices when an address is confirmed and TOTP is off |
| Email unlock (server share E) | Cryptographic, held by the server | Optional: link + password replace the Secret Key on a new device |
| Passkey (WebAuthn PRF) | Cryptographic, on the authenticator | Optional "require passkey": every password or email unlock, on every device |
| Trusted device (30 days) | Access control (cookie) + local Secret Key | Skips the second factor; expires after a fixed 30 days |
| Lockout | Access control | Failures 1–5 free, then `min(2^(n-6) min, 4 h)` |

### Authenticator app (TOTP)

- **Enrollment.** The browser generates a 160-bit secret, shows it once as a
  QR code (`otpauth://`, SHA-1, 6 digits, 30 s) and sends it with a working
  code and the master password. The server seals it in `meta/{name}.json`;
  it never appears in the vault blob or in any response.
- **Checking.** The current 30 s step ±1 is accepted, and a step is never
  accepted twice (the last used step is stored), so an observed code cannot
  be replayed. Wrong codes count toward the lockout like wrong passwords,
  also when turning TOTP off from a signed-in session.
- **Turning it on ends all other trust.** Every other trusted device must
  pass the code at its next unlock; this browser stays trusted only if asked.
  An active secret cannot be replaced: turn it off first.
- **Turning it off** needs the master password and a current code, or the
  Recovery Key alone (lost phone). Without either, the Recovery Key unlock is
  the way back in; it does not ask for a code.

### Email

- **Address.** Set with the master password and confirmed with a 6-digit code
  mailed to it (15 minutes, 5 tries; stored as an HMAC). The old address keeps
  working until then and is told about the change. The address is sealed in
  `meta/{name}.json`; the vault file never contains it.
- **Sign-in links.** `POST /email-link` needs the master password proof, so a
  link email always means someone knows the password; it says so. The 256-bit
  token is stored as a SHA-256 hash, expires after 15 minutes, at most 3 are
  outstanding, and it is used up only inside a successful `/unlock` that also
  carries the password (and the TOTP code when on). Opening the link, or a mail
  scanner fetching it, consumes nothing. The token travels in the URL
  fragment, which browsers never send to servers, and `/verify` removes it
  from the address bar and history.
- **Email unlock.** Optional re-key that adds an email slot: KEK =
  HKDF(pwKey ‖ E). The server releases E only after a valid link, so a new
  device opens with password + link instead of the Secret Key. It is weaker
  than the Secret Key: whoever controls the mailbox and knows the password
  gets in (plus the TOTP code when on). Leave it off for maximum security;
  the address can only be removed while it is off.
- **Limits.** 3 emails per 15 minutes and 10 per day per vault (links and
  codes), on top of the per-IP edge limit. A link request with a wrong
  password counts toward the lockout; a right one does not reset it.
- **Notices** go to the confirmed address: Recovery Key used, new trusted
  device, keys or password changed, authenticator app removed, address
  changed or removed (to the old address).

### Passkeys

- **What it adds.** With "require passkey" on, a random passkey key KP joins
  the primary and email slots: KEK = HKDF(pwKey ‖ Secret Key ‖ P ‖ KP). Each
  enrolled passkey (at most 10) wraps KP under HKDF of its WebAuthn PRF
  output for a per-passkey random salt, bound to the vault id and credential
  id. Trusted devices are not exempt: every unlock needs a touch with
  user verification (PIN or biometrics). The Recovery Key slot does not use
  KP, so a lost passkey is never fatal.
- **No server involvement.** Nothing is registered or verified on the
  server; the gate is the 32 bytes only the authenticator can produce.
  Passkeys without the PRF extension are refused at enrollment.
- **Enrollment** checks the master password on the server first, then
  creates the passkey (and asks once more for a touch when the authenticator
  only answers PRF on sign-in), then re-keys. A passkey created but not
  stored, or later removed, is reported to the password manager as unknown
  where the browser supports it.
- **Scope.** Passkeys are bound to the site's domain (the WebAuthn RP ID);
  moving the site to another domain means using the Recovery Key and adding
  passkeys again. KP lives in the vault body for re-keys; removing a passkey
  drops its wrapped copy, and the rotated server share makes older blobs
  useless.

### Trusted devices

- Issued only after a real second factor (TOTP code, email link, Recovery
  Key) when "Trust this device" is ticked: an HttpOnly, `SameSite=Strict`,
  `__Host-` cookie holding a random id and a 256-bit secret. The server keeps
  the SHA-256 of the secret, a label and the fixed expiry (30 days, never
  extended); at most 10 per vault.
- A trusted device only skips the second factor. The password is still
  checked, with the device's own failure counter: 5 wrong passwords revoke
  it, and they do not lock the vault for its owner.
- **Revoking** a device (Keep menu → Security…) makes it pass the second factor
  again. It does not end a session already open there, and it may still
  remember the Secret Key: issue a new Secret Key, or change the password
  with "sign out all trusted devices", to cut it off completely.
- "This device" in the UI is whichever device the browser's cookie proves;
  session tokens carry no device binding.

## Cryptography

See [data-model.md](./data-model.md) for byte layouts.

- **KDF.** Argon2id (`m=64 MiB, t=3, p=1`), NFKC-normalized password, one run
  per unlock, split with HKDF into `authKey` (sent) and `pwKey` (kept).
  Parameters live in the header so they can be raised later; decoding enforces
  bounds. There is no pepper: the old `VITE_VAULT_SALT_KEY` was public.
- **Key slots.** A random vault key VK is wrapped (AES-256-GCM, AAD bound to
  slot type and vault id) by a KEK derived with one HKDF over the fixed-length
  concatenation of the slot's factors: primary = password key ‖ Secret Key ‖
  server share P; email (optional) = password key ‖ server share E; recovery =
  Recovery Key. With "require passkey" the passkey key KP is appended to the
  primary and email slots.
- **Body.** AES-256-GCM under `HKDF(VK)`; the whole header is the AAD, so any
  header change makes the body fail to open. Plaintext is padded to 16 KiB.
- **Files.** Each file is AES-256-GCM under a random file DEK stored in the
  body; bodies decrypt only when opened. Per-file AAD is not used: file
  ciphertexts only exist inside the authenticated body (audit F15).
- **Re-keying.** Changing the password, Secret Key or Recovery Key re-wraps
  the slots and always mints a new server share, so every older blob, backup
  or cached copy stops opening (the server no longer releases the old share).
  "Rotate all keys" (Keep menu → Security…) also replaces VK, the file DEK, the
  Secret Key and the Recovery Key, re-encrypts every file and can sign out
  all trusted devices. Copies made before still open with the old Recovery
  Key, so use it after a device or an Emergency Kit may have been exposed.
  The passkey key KP carries over (each passkey wraps it).
- **Key commitment.** AES-GCM is not key-committing; a malicious server could
  in theory craft a slot that opens under two keys, but it already sees the
  authKey, so it gains nothing it could not get by guessing passwords.

## Session safety in the UI

- **One save at a time.** `commit()` is single-flight and always starts from the latest committed archive; a second save while one is running is refused, and the Finder disables vault-changing commands meanwhile. Overlapping saves can't silently drop a change.
- **Lock wins.** `lock()` drops the session; a save that completes after locking is discarded instead of putting the archive back into React state. The Finder's Lock (red traffic light / menu) waits for a save in flight, then locks.
- **Edited files first.** Moving, renaming or trashing a folder that contains the open, edited account asks Save / Don't Save / Cancel before the change, so a later save can't recreate the old path.
- **No names leak into browser state.** Vault paths never appear in the URL, page title, `localStorage` prefs (`ck:finder` holds layout only), or drag-and-drop data (drags carry an opaque marker; paths stay in page memory). Cut/Copy/Paste of items uses an in-app clipboard. The explicit copy buttons for usernames, passwords and codes do write to the system clipboard (wiped after 30 s).

## Server rules

- **Verifiers.** `HMAC(k_ver, kind ‖ vaultId ‖ authKey)` in the vault object's
  metadata; constant-time comparison.
- **Step-up.** Every security change re-sends a proof derived from a freshly
  typed master password (or the Recovery Key); the server checks it against
  the verifier and counts failures toward the lockout. Showing the Secret Key
  checks the password on the server too.
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
- **Open session + password.** Someone who has both (an unlocked tab, or a
  trusted device and the password) can change the keys and lock the owner
  out. TOTP does not guard re-keys; keep the auto-lock short and revoke
  devices you no longer control. Server-side backups (taken before every
  re-key) still open with the previous Recovery Key.
- **Clipboard history.** OS clipboard history or sync may keep copies.
- **Timing.** Response latency may hint whether a vault name exists.
- **Email unlock + server compromise.** Someone holding both the server
  secret and the bucket can release E themselves; the email slot is then
  only as strong as the master password. Leave email unlock off if that
  matters to you.
- **Old copies.** Blobs from before the migration were readable by anyone with
  the bundle; if the old password was weak, rotate the credentials inside.
