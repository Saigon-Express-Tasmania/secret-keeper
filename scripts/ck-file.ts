/**
 * Make an encrypted import file (.ckx) for the vault app — the only way data
 * enters a vault from outside. It never touches storage credentials or the
 * live vault, and never overwrites an existing file.
 *
 *   npm run ck-file -- from-kdbx <database.kdbx> [--out keepass.ckx]
 *   npm run ck-file -- from-legacy --vault <name> [--out vault.ckx]
 *   npm run ck-file -- from-legacy --file <vault.enc|export.ckv> [--out vault.ckx]
 *
 * from-legacy reads the old settings from .env.legacy (VITE_VAULT_SALT_KEY,
 * and VITE_R2_* when downloading with --vault).
 *
 * The file is protected by a random one-time import key (printed once).
 * In the app: Tools → Import, choose the file, paste the key.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { generateFileDekBytes, importFileDek } from "@/lib/crypto/file"
import { countFiles, type VaultArchive } from "@/lib/vault/fs"
import { archiveForSave, prepareSessionArchive } from "@/lib/vault/session"

import { createR2Store } from "../server/r2Store"
import { sealImportFile } from "./lib/importFile"
import { buildArchiveFromKdbx, emptyStats, loadKdbx, printTree } from "./lib/kdbx"
import { decryptLegacyVault, isLegacyBlob } from "./lib/legacyCkv2"
import { promptHidden } from "./lib/prompt"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

type Args = { command: string; positional: string[]; flags: Map<string, string> }

function parseArgs(argv: string[]): Args {
  const [command = "", ...rest] = argv
  const positional: string[] = []
  const flags = new Map<string, string>()
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg.startsWith("--")) {
      const value = rest[i + 1]
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value.`)
      flags.set(arg.slice(2), value)
      i++
    } else {
      positional.push(arg)
    }
  }
  return { command, positional, flags }
}

/** Seal and write the import file (never overwriting); returns the import key. */
async function writeImportFile(archive: VaultArchive, out: string): Promise<string> {
  if (existsSync(out)) throw new Error(`${out} already exists; choose another --out.`)
  const { blob, importKey } = await sealImportFile(archive)
  writeFileSync(out, blob, { flag: "wx", mode: 0o600 })
  return importKey
}

function report(out: string, importKey: string, archive: VaultArchive) {
  console.log(`\nWrote ${out} (${countFiles(archive)} files, recycle bin ${archive.recycleBin?.length ?? 0}).`)
  console.log("\nImport key (shown once — needed to import the file):")
  console.log(`  ${importKey}\n`)
  console.log("In the app: Tools → Import, choose the file, paste the import key.")
  console.log("Delete the .ckx file after importing.")
}

async function fromKdbx(args: Args) {
  const path = args.positional[0]
  if (!path) throw new Error("Usage: ck-file from-kdbx <database.kdbx> [--out file.ckx]")
  const out = resolve(args.flags.get("out") ?? `${basename(path).replace(/\.kdbx$/i, "")}.ckx`)
  const password = await promptHidden("KeePass master password: ")
  const db = await loadKdbx(new Uint8Array(readFileSync(resolve(path))), password)

  const preview = emptyStats()
  printTree(db.getDefaultGroup(), "", db.meta.recycleBinUuid, preview, false)

  const fileDekBytes = generateFileDekBytes()
  const { archive, stats } = await buildArchiveFromKdbx(db, await importFileDek(fileDekBytes))
  console.log(
    `\nEntries: ${preview.entries} (OTP ${stats.otp}, attachments kept ${stats.attachmentsKept}, skipped ${stats.attachmentsSkipped})`
  )
  const packed = archiveForSave(archive, fileDekBytes)
  report(out, await writeImportFile(packed, out), packed)
}

async function fromLegacy(args: Args) {
  const legacyEnv = resolve(root, ".env.legacy")
  if (existsSync(legacyEnv)) process.loadEnvFile(legacyEnv)
  const pepper = process.env.VITE_VAULT_SALT_KEY ?? ""

  let blob: Uint8Array
  let label: string
  const file = args.flags.get("file")
  const vault = args.flags.get("vault")
  if (file) {
    blob = new Uint8Array(readFileSync(resolve(file)))
    label = basename(file).replace(/\.(enc|ckv)$/i, "")
  } else if (vault) {
    const key = vault.toLowerCase().endsWith(".enc") ? vault : `${vault}.enc`
    const env = (name: string) => {
      const value = process.env[name]
      if (!value) throw new Error(`${name} is missing from .env.legacy.`)
      return value
    }
    const store = createR2Store({
      accountId: env("VITE_R2_ACCOUNT_ID"),
      accessKeyId: env("VITE_R2_ACCESS_KEY_ID"),
      secretAccessKey: env("VITE_R2_SECRET_ACCESS_KEY"),
      bucket: env("VITE_R2_BUCKET"),
      endpoint: process.env.VITE_R2_ENDPOINT || undefined,
    })
    const object = await store.get(key)
    if (!object) throw new Error(`No legacy object ${key} in the bucket.`)
    blob = object.body
    label = key.replace(/\.enc$/i, "")
  } else {
    throw new Error("Usage: ck-file from-legacy (--vault <name> | --file <path>) [--out file.ckx]")
  }
  if (!isLegacyBlob(blob)) throw new Error("That is not a legacy CKV1/CKV2 vault file.")

  const out = resolve(args.flags.get("out") ?? `${label}.ckx`)
  const password = await promptHidden("Old master password: ")
  const raw = await decryptLegacyVault(blob, password, pepper)
  // Encrypts any v2 plaintext files under a fresh file DEK.
  const prepared = await prepareSessionArchive(raw)
  const packed = archiveForSave(prepared.payload, prepared.fileDekBytes)
  report(out, await writeImportFile(packed, out), packed)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.command === "from-kdbx") return fromKdbx(args)
  if (args.command === "from-legacy") return fromLegacy(args)
  console.log(
    "Usage:\n  npm run ck-file -- from-kdbx <database.kdbx> [--out file.ckx]\n" +
      "  npm run ck-file -- from-legacy (--vault <name> | --file <path>) [--out file.ckx]"
  )
  process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
