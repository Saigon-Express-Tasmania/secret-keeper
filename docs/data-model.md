# Data model

The vault is a **zip-like JSON archive**: nested folders and per-file encrypted JSON. After unlock, the tree of **names + ciphertext** lives in memory. A file body is decrypted only while that file is open in the viewer. On disk / remote the archive is packed (CKZ1) then encrypted (CKV2) as a single blob at the Gate-chosen object key (e.g. `vault.enc`).

## Top-level archive (`VaultArchive`)

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

type FsFile = {
  type: "file"
  nonce: string      // base64, 12 bytes
  ciphertext: string // base64, AES-GCM over UTF-8 JSON bytes
}

type FsDir = { type: "dir"; entries: Record<string, FsNode> }
type FsNode = FsFile | FsDir

type RecycleBinEntry = {
  id: string          // uuid
  originalPath: string
  deletedAt: string   // ISO-8601
  node: FsNode        // file or entire folder tree (ciphertext preserved)
}

type VaultArchive = {
  version: 3
  updatedAt: string // ISO-8601
  fileDek?: string  // base64 32-byte DEK — present in packed blob only
  root: FsDir
  recycleBin?: RecycleBinEntry[] // soft-deleted items; not under root
}
```

- Folder and file names are the keys in `entries` (paths look like `passwords/github.json`).
- Session / React payload **strips** `fileDek`. The DEK is held as a non-extractable `CryptoKey` (plus bytes for re-pack) outside the tree.
- Empty vaults seed four directories: `passwords/`, `auth-keys/`, `wallets/`, `notes/`. Extra dirs and files are allowed.
- Name segments must not be empty, `.`, `..`, or contain `/` or `\`.
- **Recycle Bin** is archive metadata (`recycleBin`), not a folder in `root`. Soft-delete moves a file or whole folder tree into a bin entry; restore puts it back at `originalPath` (or `name (restored)` if taken); purge removes the entry forever. Missing `recycleBin` is treated as `[]`.

## Per-file encryption

Implemented in `src/lib/crypto/file.ts`:

| Piece | Approach |
| --- | --- |
| File DEK | Random 32-byte key, AES-256-GCM, unique nonce per file |
| Plaintext | `JSON.stringify` of the file body |
| Storage in tree | `nonce` + `ciphertext` (base64) |

Unlock migrates legacy **v2** archives (`{ type: "file", json: … }`) by generating a DEK, encrypting every file, bumping to v3, and re-uploading. Plaintext from that migration exists only on the unlock call stack.

## Recommended inner file shapes

These shapes are the **recommended** decrypted contents of JSON files. The archive layer does not enforce them. New files are seeded as `type: "account"`. The editor maps empty `{}` and older shapes into this form on open.

### Account (`type: "account"`) — default for all new files

KeePass-style login / service secret. One account per file.

```ts
type OtpSettings = {
  type: "totp" | "hotp"
  secret: string // Base32
  algorithm: "SHA1" | "SHA256" | "SHA512"
  digits: 6 | 7 | 8
  period: number // TOTP seconds, default 30
  counter: number // HOTP, default 0
  issuer: string
  label: string
}

type AccountEntry = {
  type: "account"
  id: string // uuid
  title: string
  description: string
  username: string
  password: string
  url: string
  recoveryEmail: string
  recoveryKeys: string[]
  notes: string
  otp: OtpSettings | null
  createdAt: string
  updatedAt: string
  extra?: Record<string, JsonValue> // preserved unknown keys
}
```

### Legacy shapes (still accepted on open)

Older recommended types are migrated into `AccountEntry` when opened in the editor. Saving rewrites the file as `type: "account"`.

#### Password (`type: "password"`)

```ts
type PasswordItem = {
  type: "password"
  id: string
  title: string
  username?: string
  password: string
  url?: string
  notes?: string
  createdAt: string
  updatedAt: string
}
```

#### Auth key (`type: "auth_key"`)

```ts
type AuthKeyItem = {
  type: "auth_key"
  id: string
  title: string
  kind?: "api" | "ssh" | "totp" | "recovery" | "other"
  secret: string
  issuer?: string
  notes?: string
  createdAt: string
  updatedAt: string
}
```

`kind: "totp"` / `"hotp"` maps into `otp`. Other kinds map `secret` into password or recovery keys.

#### Wallet (`type: "wallet"`)

```ts
type WalletItem = {
  type: "wallet"
  id: string
  title: string
  network?: string
  address?: string
  privateKey?: string
  seedPhrase?: string
  notes?: string
  createdAt: string
  updatedAt: string
}
```

(Wallet-specific fields land in `extra` / notes until a dedicated wallet editor exists.)

#### Note (`type: "note"`)

```ts
type NoteItem = {
  type: "note"
  id: string
  title: string
  body: string
  notes?: string
  createdAt: string
  updatedAt: string
}
```

`body` maps into `notes`.

## Pack + encrypt pipeline

```text
VaultArchive JSON (v3, includes fileDek when packing)
  → CKZ1: deflate-raw + byte scramble
  → CKV2: Argon2id + AES-256-GCM
  → vault.enc (remote + local ciphertext cache)
```

### CKZ1 (inside ciphertext)

| Field | Size | Notes |
| --- | --- | --- |
| Magic | 4 | `CKZ1` |
| Uncompressed length | 4 | uint32 LE of JSON bytes |
| Payload | rest | scrambled deflate-raw bytes |

Scramble is reversible obfuscation only (not a security boundary). Real secrecy is AES-GCM (outer blob + per-file).

### CKV2 (on-disk / remote)

| Field | Size | Notes |
| --- | --- | --- |
| Magic | 4 | `CKV2` |
| Format version | 1 | `2` |
| KDF id | 1 | `1` = Argon2id |
| Salt | 16 | random per encrypt |
| Nonce | 12 | AES-GCM IV |
| Ciphertext + tag | rest | GCM over CKZ1 bytes; AAD = magic + version |

## Legacy formats

- **CKV1** blobs decrypt to a flat `items` list and migrate into a v2-style tree, then to v3 per-file encryption on unlock.
- **Archive v2** used plaintext `{ type: "file", json }`. Unlock encrypts all files and rewrites as v3.

New writes always use CKV2 outer blobs and archive v3.

## On-disk / remote representation

- In memory (session): `VaultArchive` without `fileDek`; file bodies stay ciphertext until opened
- Packed for save: same tree plus `fileDek`
- Remote / local cache: encrypted bytes at the session object key (from Gate vault name)
