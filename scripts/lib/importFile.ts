import { formatKey, makeSlot, newRecoveryKey, newVaultId, newVaultKey, recoveryKek } from "@/lib/crypto/keys"
import { sealExportFile } from "@/lib/crypto/vaultFile"
import type { VaultArchive } from "@/lib/vault/fs"

/**
 * Seal a pack-ready archive (with fileDek) as an import file under a fresh
 * vault key; only the returned one-time import key (RK1-…) opens it.
 */
export async function sealImportFile(
  archive: VaultArchive
): Promise<{ blob: Uint8Array; importKey: string }> {
  const vaultId = newVaultId()
  const vaultKey = newVaultKey()
  const importKey = newRecoveryKey()
  const recoverySlot = await makeSlot("recovery", vaultId, recoveryKek(vaultId, importKey), vaultKey)
  const blob = await sealExportFile({ vaultId, vaultKey, recoverySlot, archive, keepRecycleBin: true })
  const text = formatKey("RK1", importKey)
  importKey.fill(0)
  vaultKey.fill(0)
  return { blob, importKey: text }
}
