/**
 * Import boundaries:
 *  - browser code (src/) never imports server code (server/, netlify/), which
 *    holds storage credentials and server secrets;
 *  - code bundled into the Function (server/, netlify/, src/shared/) uses only
 *    relative runtime imports, so bundling never depends on path aliases.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "..")

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx|mts)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** Runtime import specifiers (type-only imports are erased and allowed). */
function runtimeImports(source: string): string[] {
  const specifiers: string[] = []
  const pattern = /^\s*(import|export)\s+(?!type\b)[^"']*?from\s+["']([^"']+)["']/gm
  for (const match of source.matchAll(pattern)) specifiers.push(match[2]!)
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    specifiers.push(match[1]!)
  }
  return specifiers
}

describe("import boundaries", () => {
  it("browser code never imports server code", () => {
    const offenders = files(join(root, "src")).flatMap((file) =>
      runtimeImports(readFileSync(file, "utf8"))
        .filter((spec) => /(^|\/)(server|netlify)\//.test(spec))
        .map((spec) => `${relative(root, file)} → ${spec}`)
    )
    expect(offenders).toEqual([])
  })

  it("Function code uses relative runtime imports only", () => {
    const bundled = [
      ...files(join(root, "server")),
      ...files(join(root, "netlify")),
      ...files(join(root, "src", "shared")),
      join(root, "src", "lib", "otp", "otp.ts"),
      join(root, "src", "lib", "otp", "base32.ts"),
    ].filter((file) => !file.endsWith("testkit.ts"))
    const offenders = bundled.flatMap((file) =>
      runtimeImports(readFileSync(file, "utf8"))
        .filter((spec) => spec.startsWith("@/"))
        .map((spec) => `${relative(root, file)} → ${spec}`)
    )
    expect(offenders).toEqual([])
  })
})
