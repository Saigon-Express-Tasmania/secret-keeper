import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Separate from vite.config.ts so the build guard and CSP plugin never run in tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "server/**/*.test.ts",
      "scripts/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    testTimeout: 30_000,
  },
})
