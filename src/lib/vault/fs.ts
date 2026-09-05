/**
 * Zip-like vault archive: nested folders + per-file encrypted JSON.
 * In-memory explorer holds names + ciphertext; bodies decrypt on open.
 * Packed blob (CKZ1) may include fileDek; React session payload strips it.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

/** Per-node metadata (optional on legacy vaults until unlock backfill). */
export type NodeMeta = {
  createdAt: string
  modifiedAt: string
  /** Catalog id, e.g. `fluent-color:document-16`. */
  icon?: string
}

/** Per-file ciphertext stored in the tree (AES-GCM under the file DEK). */
export type FsFile = {
  type: "file"
  nonce: string
  ciphertext: string
} & Partial<NodeMeta>

/** Legacy v2 plaintext file — only present during unlock migration. */
export type PlaintextFsFile = {
  type: "file"
  json: JsonValue
} & Partial<NodeMeta>

export type FsDir = {
  type: "dir"
  entries: Record<string, FsNode>
} & Partial<NodeMeta>

export type FsNode = FsFile | FsDir

/** Soft-deleted file or folder tree (ciphertext preserved). */
export type RecycleBinEntry = {
  id: string
  originalPath: string
  deletedAt: string
  node: FsNode
}

export type VaultArchive = {
  version: 3
  updatedAt: string
  /** Base64 32-byte DEK — present in packed blob; stripped from React payload. */
  fileDek?: string
  root: FsDir
  /** Soft-deleted items; not a user-visible folder under root. */
  recycleBin?: RecycleBinEntry[]
}

/** Raw archive as unpacked from CKZ1 (v2 or v3). */
export type RawVaultArchive = {
  version: 2 | 3
  updatedAt: string
  fileDek?: string
  root: FsDir | LegacyFsDir
  recycleBin?: RecycleBinEntry[]
}

type LegacyFsNode = PlaintextFsFile | FsFile | LegacyFsDir
type LegacyFsDir = {
  type: "dir"
  entries: Record<string, LegacyFsNode>
} & Partial<NodeMeta>

export const SEED_DIRS = ["passwords", "auth-keys", "wallets", "notes"] as const

/** Default icons for seed root folders (catalog ids). */
export const SEED_DIR_ICONS: Record<(typeof SEED_DIRS)[number], string> = {
  passwords: "fluent-color:lock-closed-16",
  "auth-keys": "fluent-color:shield-16",
  wallets: "fluent-color:savings-16",
  notes: "fluent-color:notebook-16",
}

export const DEFAULT_FOLDER_ICON = "fluent-color:document-folder-16"
export const DEFAULT_FILE_ICON = "fluent-color:document-16"

export function assertValidName(name: string): void {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    throw new Error(`Invalid path segment: ${JSON.stringify(name)}`)
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function emptyDir(meta?: Partial<NodeMeta>): FsDir {
  const t = meta?.createdAt ?? nowIso()
  return {
    type: "dir",
    entries: {},
    createdAt: t,
    modifiedAt: meta?.modifiedAt ?? t,
    ...(meta?.icon ? { icon: meta.icon } : {}),
  }
}

/** Copy optional metadata fields from a node. */
export function copyNodeMeta(node: {
  createdAt?: string
  modifiedAt?: string
  icon?: string
}): Partial<NodeMeta> {
  const out: Partial<NodeMeta> = {}
  if (typeof node.createdAt === "string") out.createdAt = node.createdAt
  if (typeof node.modifiedAt === "string") out.modifiedAt = node.modifiedAt
  if (typeof node.icon === "string") out.icon = node.icon
  return out
}

/** Create a new vault with the four starter folders (no DEK yet). */
export function createEmptyArchive(): VaultArchive {
  const t = nowIso()
  const entries: Record<string, FsNode> = {}
  for (const name of SEED_DIRS) {
    entries[name] = emptyDir({
      createdAt: t,
      modifiedAt: t,
      icon: SEED_DIR_ICONS[name],
    })
  }
  return {
    version: 3,
    updatedAt: t,
    root: { type: "dir", entries, createdAt: t, modifiedAt: t },
    recycleBin: [],
  }
}

export function splitPath(path: string): string[] {
  const trimmed = path.replace(/^\/+|\/+$/g, "")
  if (!trimmed) return []
  return trimmed.split("/").filter(Boolean)
}

export function joinPath(...parts: string[]): string {
  return parts
    .flatMap((p) => splitPath(p))
    .filter(Boolean)
    .join("/")
}

export function parentPath(path: string): string {
  const parts = splitPath(path)
  if (parts.length === 0) return ""
  return parts.slice(0, -1).join("/")
}

export function pathBasename(path: string): string {
  const parts = splitPath(path)
  return parts[parts.length - 1] ?? ""
}

/** Resolve a path relative to root. Empty path returns root. */
export function getNode(archive: VaultArchive, path: string): FsNode | null {
  const parts = splitPath(path)
  let node: FsNode = archive.root
  for (const part of parts) {
    assertValidName(part)
    if (node.type !== "dir") return null
    const next: FsNode | undefined = node.entries[part]
    if (!next) return null
    node = next
  }
  return node
}

/** List direct children of a directory path. */
export function listDir(
  archive: VaultArchive,
  path = ""
): { name: string; node: FsNode }[] {
  const node = getNode(archive, path)
  if (!node || node.type !== "dir") {
    throw new Error(`Not a directory: ${path || "/"}`)
  }
  return Object.entries(node.entries).map(([name, child]) => ({
    name,
    node: child,
  }))
}

/** Root directories only (sidebar). */
export function listRootDirs(
  archive: VaultArchive
): { name: string; node: FsDir }[] {
  return listDir(archive, "")
    .filter((e): e is { name: string; node: FsDir } => e.node.type === "dir")
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Ensure directory path exists (creates intermediate dirs). */
export function mkdir(
  archive: VaultArchive,
  path: string,
  options?: { icon?: string }
): void {
  const parts = splitPath(path)
  if (parts.length === 0) return

  const t = nowIso()
  let dir = archive.root
  let createdLeaf = false
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    assertValidName(part)
    const existing = dir.entries[part]
    const isLeaf = i === parts.length - 1
    if (!existing) {
      const created = emptyDir({
        createdAt: t,
        modifiedAt: t,
        ...(isLeaf && options?.icon ? { icon: options.icon } : {}),
      })
      dir.entries[part] = created
      dir = created
      if (isLeaf) createdLeaf = true
    } else if (existing.type === "dir") {
      dir = existing
    } else {
      throw new Error(`Path component is a file: ${part}`)
    }
  }
  if (createdLeaf && options?.icon && dir.type === "dir") {
    dir.icon = options.icon
  }
  archive.updatedAt = t
}

/** Write or overwrite an encrypted file at path (creates parent dirs). */
export function putFile(
  archive: VaultArchive,
  path: string,
  file: Omit<FsFile, "type"> & { icon?: string }
): void {
  const parts = splitPath(path)
  if (parts.length === 0) {
    throw new Error("Cannot write file at root")
  }
  const fileName = parts[parts.length - 1]!
  assertValidName(fileName)

  const parent = parts.slice(0, -1).join("/")
  if (parent) mkdir(archive, parent)

  const parentNode = parent ? getNode(archive, parent) : archive.root
  if (!parentNode || parentNode.type !== "dir") {
    throw new Error(`Parent is not a directory: ${parent || "/"}`)
  }

  const existing = parentNode.entries[fileName]
  if (existing && existing.type === "dir") {
    throw new Error(`Cannot overwrite directory with a file: ${path}`)
  }

  const t = nowIso()
  const createdAt =
    existing && existing.type === "file" && existing.createdAt
      ? existing.createdAt
      : t
  const icon =
    file.icon ??
    (existing && existing.type === "file" ? existing.icon : undefined)

  parentNode.entries[fileName] = {
    type: "file",
    nonce: file.nonce,
    ciphertext: file.ciphertext,
    createdAt,
    modifiedAt: t,
    ...(icon ? { icon } : {}),
  }
  archive.updatedAt = t
}

/** Set (or clear) a node's icon and bump modifiedAt. */
export function setNodeIcon(
  archive: VaultArchive,
  path: string,
  iconId: string | undefined
): void {
  const node = getNode(archive, path)
  if (!node) {
    throw new Error(`Path not found: ${path}`)
  }
  const t = nowIso()
  if (iconId) {
    node.icon = iconId
  } else {
    delete node.icon
  }
  node.modifiedAt = t
  if (!node.createdAt) node.createdAt = t
  archive.updatedAt = t
}

/** Locale-friendly date for Details columns; missing → em dash. */
export function formatNodeDate(iso: string | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/** Human-readable size for files (ciphertext bytes) or folder item counts. */
export function formatNodeSize(node: FsNode): string {
  if (node.type === "dir") {
    const n = Object.keys(node.entries).length
    return n === 1 ? "1 item" : `${n} items`
  }
  try {
    const binary = atob(node.ciphertext)
    return formatByteSize(binary.length)
  } catch {
    return "—"
  }
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function nodeTypeLabel(node: FsNode): string {
  return node.type === "dir" ? "Folder" : "JSON"
}

/** Resolve display icon id for a node (defaults by type / seed name). */
export function resolveNodeIcon(
  node: FsNode,
  name?: string
): string {
  if (node.icon) return node.icon
  if (node.type === "dir" && name && name in SEED_DIR_ICONS) {
    return SEED_DIR_ICONS[name as (typeof SEED_DIRS)[number]]
  }
  return node.type === "dir" ? DEFAULT_FOLDER_ICON : DEFAULT_FILE_ICON
}

/** Remove a file or directory at path. */
export function removeNode(archive: VaultArchive, path: string): boolean {
  const parts = splitPath(path)
  if (parts.length === 0) {
    throw new Error("Cannot remove root")
  }
  const name = parts[parts.length - 1]!
  assertValidName(name)

  const parent = parts.slice(0, -1).join("/")
  const parentNode = parent ? getNode(archive, parent) : archive.root
  if (!parentNode || parentNode.type !== "dir") return false
  if (!(name in parentNode.entries)) return false

  delete parentNode.entries[name]
  archive.updatedAt = new Date().toISOString()
  return true
}

function walk(
  node: FsNode,
  visit: (n: FsNode) => void
): void {
  visit(node)
  if (node.type === "dir") {
    for (const child of Object.values(node.entries)) {
      walk(child, visit)
    }
  }
}

export function countFiles(archive: VaultArchive): number {
  let n = 0
  walk(archive.root, (node) => {
    if (node.type === "file") n++
  })
  return n
}

/** Count directories including root. */
export function countDirs(archive: VaultArchive): number {
  let n = 0
  walk(archive.root, (node) => {
    if (node.type === "dir") n++
  })
  return n
}

export type SearchHit = {
  path: string
  name: string
  kind: "file" | "dir"
  /** Which field matched: the basename or an ancestor folder segment. */
  match: "name" | "folder"
}

/**
 * Search by file/folder name and ancestor path segments only.
 * Does not decrypt file contents.
 */
export function searchArchive(
  archive: VaultArchive,
  query: string
): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const hits: SearchHit[] = []

  function visit(dir: FsDir, pathParts: string[]): void {
    for (const [name, child] of Object.entries(dir.entries)) {
      const childPath = [...pathParts, name]
      const path = childPath.join("/")
      const nameMatch = name.toLowerCase().includes(q)
      const folderMatch = pathParts.some((p) => p.toLowerCase().includes(q))

      if (nameMatch || folderMatch) {
        hits.push({
          path,
          name,
          kind: child.type === "dir" ? "dir" : "file",
          match: nameMatch ? "name" : "folder",
        })
      }

      if (child.type === "dir") {
        visit(child, childPath)
      }
    }
  }

  visit(archive.root, [])
  hits.sort((a, b) => a.path.localeCompare(b.path))
  return hits
}

/** Strip fileDek so React state never holds DEK bytes. */
export function stripFileDek(archive: VaultArchive): VaultArchive {
  const { fileDek: _removed, ...rest } = archive
  return rest
}

/** Attach fileDek for packing / outer encrypt. */
export function withFileDek(
  archive: VaultArchive,
  fileDekBase64: string
): VaultArchive {
  return { ...archive, fileDek: fileDekBase64, version: 3 }
}

export function isEncryptedFile(value: unknown): value is FsFile {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (
    v.type !== "file" ||
    typeof v.nonce !== "string" ||
    typeof v.ciphertext !== "string"
  ) {
    return false
  }
  return hasValidOptionalMeta(v)
}

export function isPlaintextFile(value: unknown): value is PlaintextFsFile {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v.type !== "file" || !("json" in v)) return false
  return hasValidOptionalMeta(v)
}

function hasValidOptionalMeta(v: Record<string, unknown>): boolean {
  if (v.createdAt !== undefined && typeof v.createdAt !== "string") return false
  if (v.modifiedAt !== undefined && typeof v.modifiedAt !== "string") {
    return false
  }
  if (v.icon !== undefined && typeof v.icon !== "string") return false
  return true
}

function isRecycleBinEntry(value: unknown): value is RecycleBinEntry {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === "string" &&
    typeof v.originalPath === "string" &&
    typeof v.deletedAt === "string" &&
    isFsNode(v.node)
  )
}

function isRecycleBin(value: unknown): value is RecycleBinEntry[] {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every(isRecycleBinEntry)
}

/** Validate a packed/unpacked archive (v2 plaintext or v3 encrypted). */
export function isRawVaultArchive(value: unknown): value is RawVaultArchive {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v.version !== 2 && v.version !== 3) return false
  if (typeof v.updatedAt !== "string") return false
  if (v.fileDek !== undefined && typeof v.fileDek !== "string") return false
  if (v.recycleBin !== undefined && !isRecycleBin(v.recycleBin)) return false
  return isLegacyFsDir(v.root)
}

/** Session / packed v3 archive with encrypted files only. */
export function isVaultArchive(value: unknown): value is VaultArchive {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v.version !== 3 || typeof v.updatedAt !== "string") return false
  if (v.fileDek !== undefined && typeof v.fileDek !== "string") return false
  if (v.recycleBin !== undefined && !isRecycleBin(v.recycleBin)) return false
  return isFsDir(v.root)
}

function isFsDir(value: unknown): value is FsDir {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v.type !== "dir" || !v.entries || typeof v.entries !== "object") {
    return false
  }
  if (!hasValidOptionalMeta(v)) return false
  for (const [name, child] of Object.entries(
    v.entries as Record<string, unknown>
  )) {
    try {
      assertValidName(name)
    } catch {
      return false
    }
    if (!isFsNode(child)) return false
  }
  return true
}

function isFsNode(value: unknown): value is FsNode {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v.type === "file") return isEncryptedFile(value)
  if (v.type === "dir") return isFsDir(value)
  return false
}

function isLegacyFsDir(value: unknown): value is LegacyFsDir {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v.type !== "dir" || !v.entries || typeof v.entries !== "object") {
    return false
  }
  if (!hasValidOptionalMeta(v)) return false
  for (const [name, child] of Object.entries(
    v.entries as Record<string, unknown>
  )) {
    try {
      assertValidName(name)
    } catch {
      return false
    }
    if (!isLegacyFsNode(child)) return false
  }
  return true
}

function isLegacyFsNode(value: unknown): value is LegacyFsNode {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v.type === "file") {
    return isEncryptedFile(value) || isPlaintextFile(value)
  }
  if (v.type === "dir") return isLegacyFsDir(value)
  return false
}

/**
 * Collect plaintext files from a legacy tree (for migration).
 * Returns null when the tree has only encrypted files (or is empty of files).
 * Returns an array (possibly empty of dirs-only with plaintext history) when
 * any plaintext file is present.
 */
export function collectPlaintextFiles(
  root: LegacyFsDir,
  prefix = ""
): { path: string; json: JsonValue }[] | null {
  const out: { path: string; json: JsonValue }[] = []
  let hasPlain = false

  function visit(dir: LegacyFsDir, pathParts: string[]): void {
    for (const [name, child] of Object.entries(dir.entries)) {
      const path = [...pathParts, name].join("/")
      if (child.type === "file") {
        if (isPlaintextFile(child)) {
          hasPlain = true
          out.push({ path, json: child.json })
        }
      } else {
        visit(child, [...pathParts, name])
      }
    }
  }

  visit(root, prefix ? splitPath(prefix) : [])
  if (!hasPlain) return null
  return out
}

/** True if any file still has plaintext json. */
export function hasPlaintextFiles(root: LegacyFsDir): boolean {
  return collectPlaintextFiles(root) !== null
}

/**
 * Migrate a CKV1 flat items vault into a V2-style archive with plaintext
 * files (caller migrates to encrypted v3 next).
 */
export function migrateV1ItemsToArchive(payload: {
  version: 1
  updatedAt: string
  items: unknown[]
}): RawVaultArchive {
  const entries: Record<string, LegacyFsNode> = {}
  for (const name of SEED_DIRS) {
    entries[name] = emptyDir()
  }
  const archive: RawVaultArchive = {
    version: 2,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    root: { type: "dir", entries },
  }

  for (const item of payload.items) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    const id =
      typeof rec.id === "string" && rec.id.length > 0
        ? rec.id
        : crypto.randomUUID()
    const type = typeof rec.type === "string" ? rec.type : "note"
    const folder =
      type === "password"
        ? "passwords"
        : type === "auth_key"
          ? "auth-keys"
          : type === "wallet"
            ? "wallets"
            : "notes"
    putPlaintextFile(archive, `${folder}/${id}.json`, item as JsonValue)
  }

  return archive
}

function putPlaintextFile(
  archive: RawVaultArchive,
  path: string,
  json: JsonValue
): void {
  const parts = splitPath(path)
  if (parts.length === 0) return
  const fileName = parts[parts.length - 1]!
  let dir = archive.root as LegacyFsDir
  for (const part of parts.slice(0, -1)) {
    const existing = dir.entries[part]
    if (!existing) {
      const created = emptyDir()
      dir.entries[part] = created
      dir = created
    } else if (existing.type === "dir") {
      dir = existing
    } else {
      throw new Error(`Path component is a file: ${part}`)
    }
  }
  dir.entries[fileName] = { type: "file", json }
}
