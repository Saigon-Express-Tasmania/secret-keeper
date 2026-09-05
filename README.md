# Credentials Keep

Personal vault SPA for passwords, auth keys, wallets, and secret notes. Hosted as a static Netlify app with a pluggable storage backend. The vault is a zip-like JSON archive (folders + JSON files), compressed (CKZ1) and encrypted client-side (Argon2id + AES-GCM / CKV2). R2 download/upload is implemented; other adapters are stubs.

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- React Router (Gate `/`, Dashboard `/dashboard`)
- `@noble/hashes` (Argon2id), `aws4fetch` (R2 SigV4)

## Quick start

```bash
npm install
cp .env.example .env.local
# Fill R2 vars + a long random VITE_VAULT_SALT_KEY
# Enable CORS on the R2 bucket (origins + SigV4 headers). See docs/storage.md
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Unlock with your master password — the Gate downloads or creates `vault.enc` on R2 and keeps a local ciphertext replica.

## Project layout

```text
docs/                 Design docs
src/screens/          Gate + Dashboard
src/context/          Vault unlock state
src/lib/storage/      StorageStrategy + R2 adapter + local cache
src/lib/crypto/       CKZ1 pack + Argon2id / AES-GCM (CKV2)
src/lib/vault/        VFS archive + unlock persist + merge stub
src/components/ui/    shadcn components
netlify.toml          Netlify SPA config
.env.example          Storage + pepper env placeholders
```
## Documentation

- [Architecture](docs/architecture.md)
- [Screens](docs/screens.md)
- [Storage](docs/storage.md)
- [Security](docs/security.md)
- [Data model](docs/data-model.md)
- [Deployment](docs/deployment.md)

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Lint with oxlint |
