# Deployment (Netlify)

Credentials Keep is a static Vite SPA. Netlify builds the site and serves `dist` with an SPA fallback so client routes work on refresh.

## Config

[`netlify.toml`](../netlify.toml):

- Build command: `npm run build`
- Publish directory: `dist`
- Redirect: `/*` → `/index.html` (status 200)

## Setup

1. Push the repo to GitHub (or connect another Git remote).
2. Create a Netlify site from that repo.
3. Confirm build settings match `netlify.toml` (or leave Netlify to read the file).
4. Add environment variables in **Site settings → Environment variables** for the storage provider you use (see [storage.md](./storage.md)).
5. Deploy.

## Local preview of production build

```bash
npm run build
npm run preview
```

## Environment notes

- Vite inlines `VITE_*` at build time. Changing Netlify env vars requires a **new deploy**.
- Do not put production storage secrets in client-visible `VITE_*` vars long-term. Prefer Netlify Functions with server-only env (no `VITE_` prefix) that proxy download/upload of the ciphertext blob. See [security.md](./security.md).

## Suggested Function shape (future)

| Function | Role |
| --- | --- |
| `GET /.netlify/functions/vault` | Return ciphertext bytes from storage |
| `PUT /.netlify/functions/vault` | Replace ciphertext bytes in storage |

The browser would still encrypt/decrypt locally; Functions only move opaque bytes with provider credentials kept on Netlify.
