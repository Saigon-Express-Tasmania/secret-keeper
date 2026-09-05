import type { RawVaultArchive } from "@/lib/vault/fs"
import { createEmptyArchive } from "@/lib/vault/fs"

export type MergeInputs = {
  local: RawVaultArchive | null
  remote: RawVaultArchive | null
}

export type MergeResult = {
  payload: RawVaultArchive
  /** Which ciphertext source to keep after merge (for cache/upload). */
  source: "remote" | "local" | "empty"
}

/**
 * Merge local and remote vault archives.
 *
 * TODO: replace with real file-level merge (by path / updatedAt).
 * Current policy: prefer remote when present; else local; else empty.
 */
export function mergeVaults(inputs: MergeInputs): MergeResult {
  const { local, remote } = inputs

  if (remote) {
    return { payload: remote, source: "remote" }
  }
  if (local) {
    return { payload: local, source: "local" }
  }
  return {
    payload: createEmptyArchive() as unknown as RawVaultArchive,
    source: "empty",
  }
}
