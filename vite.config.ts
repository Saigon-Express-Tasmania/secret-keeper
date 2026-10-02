import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Strict CSP for the built app. Delivered as a <meta> tag at build time only:
 * as an HTTP header it would also hit the dev server (netlify dev applies
 * netlify.toml headers) and block Vite's inline HMR preamble.
 * frame-ancestors cannot be set from <meta>; netlify.toml sends it as a header.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  // Radix injects <style> elements (scroll lock), so inline styles stay allowed.
  "style-src 'self' 'unsafe-inline'",
  // blob: for generated QR codes; https: for external node icon URLs (<img> only).
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  // Only our own /api/vault Function; storage is never reached from the browser.
  "connect-src 'self'",
  "manifest-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'ck-content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: CONTENT_SECURITY_POLICY,
          },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

/**
 * Public VITE_* variables that may be inlined into the bundle. Empty on
 * purpose: storage keys and the old pepper once leaked this way (security
 * audit F1/F2), so any VITE_ variable fails the build until reviewed here.
 */
const PUBLIC_ENV_ALLOWLIST: readonly string[] = []

function assertNoInlinedSecrets(mode: string): void {
  const inlined = Object.keys(loadEnv(mode, rootDir, 'VITE_')).filter(
    (name) => !PUBLIC_ENV_ALLOWLIST.includes(name)
  )
  if (inlined.length > 0) {
    throw new Error(
      `Refusing to start: ${inlined.join(', ')} would be inlined into the public bundle. ` +
        'Remove these VITE_ variables (server settings use plain names, see .env.example; ' +
        'old values for the migration CLI belong in .env.legacy).'
    )
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  assertNoInlinedSecrets(mode)
  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, './src'),
      },
    },
    server: {
      // Local vault API (npm run dev:api). Under `netlify dev` (port 8888) the
      // Function is served directly and this proxy is not used.
      // changeOrigin stays false: the API checks that Origin matches Host.
      proxy: {
        '/api': {
          target: process.env.CK_API_URL ?? 'http://localhost:8787',
          changeOrigin: false,
        },
      },
    },
  }
})
