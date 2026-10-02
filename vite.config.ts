import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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
  // blob: for generated QR codes.
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // R2 S3 API until the Netlify Functions proxy replaces direct storage access.
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
})
