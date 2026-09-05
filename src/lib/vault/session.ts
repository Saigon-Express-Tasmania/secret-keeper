/**
 * Normalize any unlocked raw archive into a v3 session vault:
 * encrypted files + DEK held separately from the React tree.
 */

import {
  base64ToBytes,
  bytesToBase64,
  encryptFileJson,
  generateFileDekBytes,
  importFileDek,
} from "@/lib/crypto/file"
import {
  collectPlaintextFiles,
  createEmptyArchive,
  isEncryptedFile,
  isPlaintextFile,
  stripFileDek,
  type FsDir,
  type FsNode,
  type RawVaultArchive,
  type VaultArchive,
} from "@/lib/vault/fs"

export type PreparedVault = {
  /** Session tree: encrypted files, no fileDek field. */
  payload: VaultArchive
  /** Raw DEK bytes for packing on save. */
  fileDekBytes: Uint8Array
  /** Non-extractable CryptoKey for decrypt-on-open / encrypt-on-create. */
  fileDekKey: CryptoKey
  /** True when plaintext v2 files were encrypted or DEK was generated. */
  migrated: boolean
}

function cloneEncryptedTree(root: FsDir): FsDir {
  const entries: Record<string, FsNode> = {}
  for (const [name, child] of Object.entries(root.entries)) {
    if (child.type === "file") {
      entries[name] = {
        type: "file",
        nonce: child.nonce,
        ciphertext: child.ciphertext,
      }
    } else {
      entries[name] = cloneEncryptedTree(child)
    }
  }
  return { type: "dir", entries }
}

async function copyTreeEncrypted(
  from: RawVaultArchive["root"],
  to: FsDir,
  key: CryptoKey
): Promise<void> {
  for (const [name, child] of Object.entries(from.entries)) {
    if (child.type === "dir") {
      let dest = to.entries[name]
      if (!dest || dest.type !== "dir") {
        dest = { type: "dir", entries: {} }
        to.entries[name] = dest
      }
      await copyTreeEncrypted(child, dest, key)
    } else if (isPlaintextFile(child)) {
      const enc = await encryptFileJson(child.json, key)
      to.entries[name] = {
        type: "file",
        nonce: enc.nonce,
        ciphertext: enc.ciphertext,
      }
    } else if (isEncryptedFile(child)) {
      to.entries[name] = {
        type: "file",
        nonce: child.nonce,
        ciphertext: child.ciphertext,
      }
    }
  }
}

/**
 * Ensure archive is v3 with per-file ciphertext.
 * Plaintext bodies exist only on this call stack — never returned as json.
 */
export async function prepareSessionArchive(
  raw: RawVaultArchive
): Promise<PreparedVault> {
  const hasPlain = collectPlaintextFiles(raw.root) !== null
  const alreadyEncrypted =
    !hasPlain && raw.version === 3 && typeof raw.fileDek === "string"

  if (alreadyEncrypted) {
    const fileDekBytes = base64ToBytes(raw.fileDek!)
    const fileDekKey = await importFileDek(fileDekBytes)
    const payload = stripFileDek({
      version: 3,
      updatedAt: raw.updatedAt,
      root: cloneEncryptedTree(raw.root as FsDir),
      recycleBin: raw.recycleBin ? structuredClone(raw.recycleBin) : [],
    })
    return { payload, fileDekBytes, fileDekKey, migrated: false }
  }

  // Migrate: generate DEK and encrypt any plaintext files
  const fileDekBytes = generateFileDekBytes()
  const fileDekKey = await importFileDek(fileDekBytes)
  const payload = createEmptyArchive()
  payload.updatedAt = raw.updatedAt || new Date().toISOString()
  payload.root = { type: "dir", entries: {} }
  await copyTreeEncrypted(raw.root, payload.root, fileDekKey)
  // Recycle bin is a v3 feature; carry over if already present and encrypted
  payload.recycleBin = raw.recycleBin ? structuredClone(raw.recycleBin) : []

  return {
    payload: stripFileDek(payload),
    fileDekBytes,
    fileDekKey,
    migrated: true,
  }
}

/** Create a fresh empty vault with a new file DEK. */
export async function prepareEmptyVault(): Promise<PreparedVault> {
  const fileDekBytes = generateFileDekBytes()
  const fileDekKey = await importFileDek(fileDekBytes)
  return {
    payload: createEmptyArchive(),
    fileDekBytes,
    fileDekKey,
    migrated: true,
  }
}

/** Pack-ready archive including fileDek for outer encrypt. */
export function archiveForSave(
  payload: VaultArchive,
  fileDekBytes: Uint8Array
): VaultArchive {
  return {
    ...structuredClone(payload),
    version: 3,
    fileDek: bytesToBase64(fileDekBytes),
  }
}
