import { describe, expect, it } from "vitest"

import {
  newKdfSalt,
  newRecoveryKey,
  newSecretKey,
  newShare,
  newVaultId,
  newVaultKey,
} from "@/lib/crypto/keys"
import {
  BODY_PAD_BYTES,
  buildSlots,
  openEmailSlot,
  openExportFile,
  openPrimarySlot,
  openRecoverySlot,
  openVaultBody,
  padBody,
  sealExportFile,
  sealVaultFile,
  unpadBody,
} from "@/lib/crypto/vaultFile"
import { createEmptyArchive } from "@/lib/vault/fs"
import { randomBytes } from "@/shared/bytes"
import { DEFAULT_KDF, parseCkv3, type Ckv3Header } from "@/shared/ckv3"

async function fixture() {
  const vaultId = newVaultId()
  const vaultKey = newVaultKey()
  const pwKey = randomBytes(32)
  const secretKey = newSecretKey()
  const srvShare = newShare()
  const emailShare = newShare()
  const recoveryKey = newRecoveryKey()
  const slots = await buildSlots({
    vaultId,
    vaultKey,
    pwKey,
    secretKey,
    srvShare,
    emailShare,
    recovery: { key: recoveryKey },
  })
  const header: Ckv3Header = {
    v: 1,
    purpose: "vault",
    vaultId,
    rev: 1,
    kdf: { alg: "argon2id", v: 19, ...DEFAULT_KDF, salt: newKdfSalt() },
    slots,
  }
  const archive = { ...createEmptyArchive(), fileDek: "ZGVr", keys: { sk: "c2s" } }
  const blob = await sealVaultFile(header, vaultKey, archive)
  return { vaultId, vaultKey, pwKey, secretKey, srvShare, emailShare, recoveryKey, header, archive, blob }
}

describe("body padding", () => {
  it("pads to 16 KiB multiples and round-trips", () => {
    for (const size of [0, 1, BODY_PAD_BYTES - 4, BODY_PAD_BYTES - 3, 40_000]) {
      const pack = randomBytes(size)
      const body = padBody(pack)
      expect(body.byteLength % BODY_PAD_BYTES).toBe(0)
      expect(unpadBody(body)).toEqual(pack)
    }
    expect(() => unpadBody(new Uint8Array([255, 255, 0, 0]))).toThrow()
  })
})

describe("vault files", () => {
  it("open through every slot to the same archive", async () => {
    const f = await fixture()
    const parsed = parseCkv3(f.blob)
    const viaPrimary = await openPrimarySlot(parsed.header, f.pwKey, f.secretKey, f.srvShare)
    const viaEmail = await openEmailSlot(parsed.header, f.pwKey, f.emailShare)
    const viaRecovery = await openRecoverySlot(parsed.header, f.recoveryKey)
    expect(viaPrimary).toEqual(f.vaultKey)
    expect(viaEmail).toEqual(f.vaultKey)
    expect(viaRecovery).toEqual(f.vaultKey)
    expect(await openVaultBody(parsed, viaPrimary)).toEqual(JSON.parse(JSON.stringify(f.archive)))
  })

  it("fail when any header byte changes", async () => {
    const f = await fixture()
    const tampered = f.blob.slice()
    // Flip a byte inside the header JSON (rev 1 → 2) without breaking JSON.
    const text = new TextDecoder().decode(tampered)
    const index = text.indexOf('"rev":1') + '"rev":'.length
    tampered[index] = "2".charCodeAt(0)
    const parsed = parseCkv3(tampered)
    expect(parsed.header.rev).toBe(2)
    await expect(openVaultBody(parsed, f.vaultKey)).rejects.toThrow(/damaged or was modified/)
  })

  it("fail with the wrong vault key or a flipped ciphertext bit", async () => {
    const f = await fixture()
    await expect(openVaultBody(parseCkv3(f.blob), newVaultKey())).rejects.toThrow()
    const flipped = f.blob.slice()
    flipped[flipped.length - 1]! ^= 1
    await expect(openVaultBody(parseCkv3(flipped), f.vaultKey)).rejects.toThrow()
  })
})

describe("export files", () => {
  it("open with the Recovery Key or the vault key, never carrying vault keys", async () => {
    const f = await fixture()
    const recoverySlot = f.header.slots.find((s) => s.type === "recovery")!
    const blob = await sealExportFile({
      vaultId: f.vaultId,
      vaultKey: f.vaultKey,
      recoverySlot,
      archive: f.archive,
    })
    expect(parseCkv3(blob).header.purpose).toBe("export")
    const viaR = await openExportFile(blob, { recoveryKey: f.recoveryKey })
    const viaVk = await openExportFile(blob, { vaultKey: f.vaultKey })
    expect(viaR).toEqual(viaVk)
    expect(viaR.keys).toBeUndefined()
    expect(viaR.fileDek).toBe("ZGVr")
    await expect(openExportFile(blob, { recoveryKey: newRecoveryKey() })).rejects.toThrow()
    await expect(openExportFile(f.blob, { vaultKey: f.vaultKey })).rejects.toThrow(/not an export/)
  })
})
