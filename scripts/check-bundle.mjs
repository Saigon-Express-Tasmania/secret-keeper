/**
 * Fails if the built browser bundle contains storage endpoints, request
 * signing, or anything that looks like an inlined secret (audit F1/F2).
 * Run after `npm run build`.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const FORBIDDEN = [
  [/r2\.cloudflarestorage\.com/i, "R2 S3 API host"],
  [/x-amz-(date|content-sha256)/i, "AWS SigV4 request signing"],
  [/VITE_[A-Z0-9_]+/, "VITE_ variable name"],
  [/SECRET_ACCESS_KEY|CK_SERVER_SECRET|BREVO_API_KEY|VAULT_SETUP_CODE/, "server secret name"],
  [/AKIA[0-9A-Z]{16}/, "AWS-style access key id"],
]

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )
}

const problems = []
for (const file of walk("dist").filter((f) => /\.(js|html|css|json)$/.test(f))) {
  const text = readFileSync(file, "utf8")
  for (const [pattern, label] of FORBIDDEN) {
    const match = text.match(pattern)
    if (match) problems.push(`${file}: ${label} (${match[0]})`)
  }
}
if (problems.length > 0) {
  console.error(`Bundle check failed:\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("Bundle check passed: no storage endpoints, signing code or secret names in dist/.")
