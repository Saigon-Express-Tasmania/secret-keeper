import { randomBytes } from "node:crypto"

import { argon2id } from "@noble/hashes/argon2.js"
import * as kdbxweb from "kdbxweb"
import { describe, expect, it } from "vitest"

import { decryptFileJson, generateFileDekBytes, importFileDek } from "@/lib/crypto/file"
import { parseKey } from "@/lib/crypto/keys"
import { packArchive } from "@/lib/crypto/pack"
import { openExportFile } from "@/lib/crypto/vaultFile"
import { createEmptyArchive, getNode, putFile } from "@/lib/vault/fs"
import { archiveForSave, prepareSessionArchive } from "@/lib/vault/session"

import { sealImportFile } from "./lib/importFile"
import { buildArchiveFromKdbx, installArgon2, loadKdbx } from "./lib/kdbx"
import { decryptLegacyVault, isLegacyBlob } from "./lib/legacyCkv2"

/** The pre-CKV3 encryptor, reproduced to build a migration fixture. */
async function legacyCkv2(archive: object, password: string, pepper: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const raw = argon2id(password, salt, { t: 3, m: 65536, p: 1, dkLen: 32, key: pepper })
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"])
  const aad = new Uint8Array([...new TextEncoder().encode("CKV2"), 2])
  const plaintext = await packArchive(archive as Parameters<typeof packArchive>[0])
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, key, plaintext.slice())
  )
  return new Uint8Array([...new TextEncoder().encode("CKV2"), 2, 1, ...salt, ...nonce, ...ct])
}

describe("from-legacy", () => {
  it("decrypts an old CKV2 vault (v2 plaintext files) into an import file", async () => {
    const legacy = {
      version: 2,
      updatedAt: "2026-01-01T00:00:00.000Z",
      root: { type: "dir", entries: { notes: { type: "dir", entries: { "a.json": { type: "file", json: { title: "old note" } } } } } },
    }
    const blob = await legacyCkv2(legacy, "old password", "old pepper")
    expect(isLegacyBlob(blob)).toBe(true)
    await expect(decryptLegacyVault(blob, "wrong", "old pepper")).rejects.toThrow(/Wrong password/)
    const raw = await decryptLegacyVault(blob, "old password", "old pepper")
    const prepared = await prepareSessionArchive(raw)

    const { blob: file, importKey } = await sealImportFile(
      archiveForSave(prepared.payload, prepared.fileDekBytes)
    )
    const opened = await openExportFile(file, { recoveryKey: parseKey("RK1", importKey) })
    const reopened = await prepareSessionArchive(opened)
    const node = getNode(reopened.payload, "notes/a.json")
    expect(node?.type).toBe("file")
    if (node?.type !== "file") return
    expect(await decryptFileJson(node, reopened.fileDekKey)).toEqual({ title: "old note" })
  }, 60_000)
})

describe("from-kdbx", () => {
  it("maps KeePass entries (with TOTP) into encrypted account files", async () => {
    installArgon2()
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString("kp pass"))
    const db = kdbxweb.Kdbx.create(credentials, "Test")
    const entry = db.createEntry(db.getDefaultGroup())
    entry.fields.set("Title", "GitHub")
    entry.fields.set("UserName", "octocat")
    entry.fields.set("Password", kdbxweb.ProtectedValue.fromString("hunter22"))
    entry.fields.set("otp", "otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub")
    const saved = new Uint8Array(await db.save())

    await expect(loadKdbx(saved, "nope")).rejects.toThrow(/Invalid KeePass/)
    const loaded = await loadKdbx(saved, "kp pass")
    const fileDekBytes = generateFileDekBytes()
    const { archive, stats } = await buildArchiveFromKdbx(loaded, await importFileDek(fileDekBytes))
    expect(stats.otp).toBe(1)
    const node = getNode(archive, "GitHub.json")
    expect(node?.type).toBe("file")
    if (node?.type !== "file") return
    const json = (await decryptFileJson(node, await importFileDek(fileDekBytes))) as Record<string, unknown>
    expect(json).toMatchObject({ title: "GitHub", username: "octocat", password: "hunter22" })
    expect((json.otp as { secret: string }).secret).toBe("JBSWY3DPEHPK3PXP")
  }, 60_000)

  it("refuses archives too large to ever fit in a vault", async () => {
    const archive = createEmptyArchive()
    putFile(archive, "big.json", {
      nonce: "bm9uY2UAAAAAAAAA",
      ciphertext: randomBytes(4.5 * 1024 * 1024).toString("base64"),
    })
    await expect(
      sealImportFile(archiveForSave(archive, generateFileDekBytes()))
    ).rejects.toThrow(/too large/)
  }, 60_000)
})
