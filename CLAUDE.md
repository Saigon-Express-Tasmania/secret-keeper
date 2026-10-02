# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server (http://localhost:5173), proxies /api to dev:api
npm run dev:api      # local vault API on :8787 (file store in .local/dev-store, setup code "dev")
npm run dev:netlify  # netlify dev: Vite + Function on :8888 (needs R2 env)
npm run build        # tsc -b && vite build (refuses if any VITE_* var is set)
npm run check:bundle # scan dist/ for storage hosts / signing code / secret names
npm run lint         # oxlint
npm test             # vitest (node env); *.test.ts next to sources, tests/ for end-to-end
npm run ck-file      # scripts/ck-file.ts: encrypted import files (from-kdbx, from-legacy)
npm run expand-icons # regenerate icon JSON catalogs in src/lib/icons
```

`@/` aliases `src/`. Local development needs no cloud account (`dev:api` + `dev`). Server settings come from `.env.local` / Netlify env without the `VITE_` prefix (see `.env.example`); no `VITE_*` variables exist. Setup and migration: [README.md](README.md), [docs/deployment.md](docs/deployment.md).

## Architecture

Static React 19 + Vite + Tailwind 4 + shadcn/ui SPA plus one Netlify Function (`netlify/functions/vault.mts` → `server/`). The browser does all encryption; the Function stores ciphertext on R2 and enforces access. Two routes: Gate (`/`, `src/screens/Gate.tsx`: unlock / create / recovery steps) and Dashboard (`/dashboard`).

Unlock (`src/lib/vault/vaultSession.ts`): `POST /api/vault/prelogin` (KDF params) → Argon2id in the browser → authKey to `POST /unlock` (second factor off trusted devices, lockout) → server returns a session, server share P and the CKV3 blob → open the primary slot (pwKey ‖ Secret Key ‖ P [‖ passkey key]) or email/recovery slot → vault key → body (CKZ1 archive) → per-file AES-GCM under the file DEK.

- Format and keys: `src/shared/ckv3.ts` (container codec, also used by the server), `src/lib/crypto/{kdf,keys,vaultFile}.ts`; details in `docs/data-model.md`.
- `VaultContext` wraps one `VaultSession`; keys stay outside React state and are wiped on lock (manual, idle, pagehide, ended session).
- Saves: `PUT /api/vault/blob` with `If-Match` and rev+1; conflicts reload and replay the mutator once. Changing slots/KDF/passkeys is a re-key (step-up proof, fresh server shares, new auth epoch).
- Server state: `vaults/{name}.enc` (blob + auth record in object metadata), `meta/{name}.json` (lockout, TOTP, email, devices; compare-and-swap), `backups/`. See `docs/storage.md`.
- Boundaries: `src/` never imports `server/`/`netlify/`; Function-bundled code (`server/`, `netlify/`, `src/shared/`) uses relative imports only (`tests/boundaries.test.ts`).
- Dashboard UI lives in `components/dashboard/`, security UI in `components/security/`; icons come from `lib/icons/catalog.ts` backed by the JSON catalogs.

Design docs in `docs/` (architecture, data-model, storage, security, security-audit, screens, deployment) are the source of truth for intended behavior.
