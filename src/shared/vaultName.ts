/**
 * Vault names and the storage layout derived from them.
 * Names are lowercase `a-z 0-9 -`, 1–48 chars, no leading/trailing hyphen,
 * so every object key below is collision-free and safe in URLs and headers.
 */

const VAULT_NAME = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/

export class VaultNameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VaultNameError"
  }
}

/** Trim + lowercase, then validate. Throws VaultNameError. */
export function normalizeVaultName(input: string): string {
  const name = (typeof input === "string" ? input : "").trim().toLowerCase()
  if (!name) {
    throw new VaultNameError("Vault name cannot be empty.")
  }
  if (!VAULT_NAME.test(name)) {
    throw new VaultNameError(
      "Vault names use 1–48 lowercase letters, digits and hyphens (not at the start or end)."
    )
  }
  return name
}

export function isValidVaultName(input: string): boolean {
  try {
    return normalizeVaultName(input) === input
  } catch {
    return false
  }
}

export function vaultObjectKey(name: string): string {
  return `vaults/${name}.enc`
}

export function metaObjectKey(name: string): string {
  return `meta/${name}.json`
}

export function backupPrefix(name: string): string {
  return `backups/${name}/`
}
