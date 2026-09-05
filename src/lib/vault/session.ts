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
  copyNodeMeta,
  createEmptyArchive,
  isEncryptedFile,
  isPlaintextFile,
  SEED_DIR_ICONS,
  SEED_DIRS,
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
        ...copyNodeMeta(child),
      }
    } else {
      entries[name] = cloneEncryptedTree(child)
    }
  }
  return { type: "dir", entries, ...copyNodeMeta(root) }
}

async function copyTreeEncrypted(
  from: RawVaultArchive["root"],
  to: FsDir,
  key: CryptoKey
): Promise<void> {
  // Preserve directory meta on the destination when copying into an existing dir
  Object.assign(to, copyNodeMeta(from))

  for (const [name, child] of Object.entries(from.entries)) {
    if (child.type === "dir") {
      let dest = to.entries[name]
      if (!dest || dest.type !== "dir") {
        dest = { type: "dir", entries: {}, ...copyNodeMeta(child) }
        to.entries[name] = dest
      } else {
        Object.assign(dest, copyNodeMeta(child))
      }
      await copyTreeEncrypted(child, dest, key)
    } else if (isPlaintextFile(child)) {
      const enc = await encryptFileJson(child.json, key)
      to.entries[name] = {
        type: "file",
        nonce: enc.nonce,
        ciphertext: enc.ciphertext,
        ...copyNodeMeta(child),
      }
    } else if (isEncryptedFile(child)) {
      to.entries[name] = {
        type: "file",
        nonce: child.nonce,
        ciphertext: child.ciphertext,
        ...copyNodeMeta(child),
      }
    }
  }
}

/**
 * Backfill missing createdAt/modifiedAt and seed-folder icons.
 * Returns true when any node was patched.
 */
export function backfillNodeMeta(archive: VaultArchive): boolean {
  const fallback = archive.updatedAt || new Date().toISOString()
  let patched = false

  function visitDir(dir: FsDir, pathParts: string[]): void {
    if (!dir.createdAt) {
      dir.createdAt = fallback
      patched = true
    }
    if (!dir.modifiedAt) {
      dir.modifiedAt = dir.createdAt ?? fallback
      patched = true
    }
    if (pathParts.length === 1) {
      const name = pathParts[0]!
      if (
        !dir.icon &&
        (SEED_DIRS as readonly string[]).includes(name)
      ) {
        dir.icon = SEED_DIR_ICONS[name as (typeof SEED_DIRS)[number]]
        patched = true
      }
    }
    for (const [name, child] of Object.entries(dir.entries)) {
      if (child.type === "dir") {
        visitDir(child, [...pathParts, name])
      } else {
        if (!child.createdAt) {
          child.createdAt = fallback
          patched = true
        }
        if (!child.modifiedAt) {
          child.modifiedAt = child.createdAt ?? fallback
          patched = true
        }
      }
    }
  }

  visitDir(archive.root, [])

  for (const entry of archive.recycleBin ?? []) {
    if (entry.node.type === "dir") {
      visitDir(entry.node, [])
    } else {
      if (!entry.node.createdAt) {
        entry.node.createdAt = fallback
        patched = true
      }
      if (!entry.node.modifiedAt) {
        entry.node.modifiedAt = entry.node.createdAt ?? fallback
        patched = true
      }
    }
  }

  return patched
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
    const metaPatched = backfillNodeMeta(payload)
    return {
      payload,
      fileDekBytes,
      fileDekKey,
      migrated: metaPatched,
    }
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
  backfillNodeMeta(payload)

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
