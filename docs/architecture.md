# Architecture

Credentials Keep is a small personal vault: a static React SPA plus one
serverless function. All encryption happens in the browser; the server only
stores ciphertext and enforces access rules (password proof, second factors,
lockout, revision order). See [security.md](./security.md) for the threat
model and [security-audit.md](./security-audit.md) for why it is built this way.

## Goals

- Manage personal secrets: logins, auth keys, wallets, notes, TOTP seeds
- Two screens: Gate (unlock / create / recover / sign-in link) and Dashboard
- Static hosting on Netlify plus a single Function; R2 as the only datastore
- Free tiers only: no database, no polling, no server-side key stretching

## High-level flow

```text
Gate: name + password
  │  POST /prelogin → KDF params (fake but stable for unknown names)
  │  Argon2id in the browser → authKey (to server) + pwKey (stays here)
  │  POST /unlock {authKey [, TOTP] [, email token]} → session + server share P + blob
  │      (second factor asked on untrusted devices; lockout after repeated failures)
  │      a valid email token also releases share E (email unlock)
  │  POST /email-link {authKey} → one-time link mailed to the confirmed address
  ▼
open CKV3 blob locally:
  primary slot = pwKey ‖ Secret Key ‖ P [‖ passkey key]   (or email slot / recovery slot)
  → vault key VK → body (CKZ1 archive) → per-file AES-GCM under the file DEK
  ▼
Dashboard: in-memory archive (names + file ciphertext); files decrypt on open
  │  save: re-encrypt body with VK → PUT /blob (If-Match ETag, rev+1)
  ▼
Lock (manual, idle, pagehide, session end) → keys wiped from memory
```

## Runtime pieces

| Piece | Role |
| --- | --- |
| `src/screens/Gate.tsx` + `src/components/gate/*` | Unlock / create / recovery / sign-in link (`/verify`) state machine, Emergency Kit |
| `src/screens/Dashboard.tsx` | Explorer, editor, Tools menu, Security dialog |
| `src/context/VaultContext.tsx` | React wrapper around one `VaultSession`; idle lock |
| `src/lib/vault/vaultSession.ts` | Client protocol: create, unlock steps, save with conflict replay, re-key, export/import |
| `src/lib/crypto/{kdf,keys,vaultFile}.ts` | Argon2id + HKDF, key slots, CKV3 body encryption |
| `src/lib/crypto/{file,pack}.ts` | Per-file AES-GCM, CKZ1 pack (deflate, bounded inflate) |
| `src/lib/api/client.ts` | Typed `/api/vault` client |
| `src/lib/device/deviceStore.ts` | Trusted-device record (Secret Key + highest revision seen), 30 days |
| `src/lib/webauthn/prf.ts` | Passkey enrollment and PRF evaluation (WebAuthn) |
| `src/lib/vault/signInLink.ts` | Reads `/verify#v=…&t=…` sign-in links |
| `src/shared/*` | Isomorphic: CKV3 codec, API types, frames, vault names, bytes |
| `netlify/functions/vault.mts` | Netlify adapter; edge rate limit |
| `server/*` | Router, routes, verifiers, sealing, sessions, device cookies, lockout, backups, mail |
| `server/twoFactor.ts`, `server/email.ts` | TOTP checks; sign-in links, confirmation codes, mail limits |
| `scripts/ck-file.ts` | Builds encrypted import files from KeePass or the old format |
| `scripts/dev-api.ts` | Local API server (file store) for development |

## Boundaries

- Browser code never imports `server/` or `netlify/` (`tests/boundaries.test.ts`).
- Code bundled into the Function uses relative imports only.
- No `VITE_*` variables: the build fails if one is set; `npm run check:bundle`
  verifies the output.

## Out of scope

- Item-level merge between concurrent edits (saves replay on top of the latest version instead)
- Offline unlock (by design: the primary slot needs the server share)
- Searching inside encrypted file contents
