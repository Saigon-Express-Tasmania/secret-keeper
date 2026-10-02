# Data model

The vault is a **zip-like JSON archive** (folders + per-file encrypted JSON),
packed (CKZ1) and encrypted (CKV3) as one blob at `vaults/{name}.enc`.
After unlock, the tree of **names + file ciphertext** lives in memory; a file
body is decrypted only while it is open.

## Archive (`VaultArchive`)

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

type NodeMeta = {
  createdAt: string  // ISO-8601 (backfilled on unlock for old vaults)
  modifiedAt: string // ISO-8601
  icon?: string      // catalog id, e.g. "fluent-color:lock-closed-16"
}

type FsFile = {
  type: "file"
  nonce: string      // base64, 12 bytes
  ciphertext: string // base64, AES-GCM over UTF-8 JSON bytes
} & Partial<NodeMeta>

type FsDir = { type: "dir"; entries: Record<string, FsNode> } & Partial<NodeMeta>
type FsNode = FsFile | FsDir

type RecycleBinEntry = { id: string; originalPath: string; deletedAt: string; node: FsNode }

type VaultKeysSection = {
  sk: string                 // Secret Key (base64url, 16 bytes)
  kp?: string                // passkey key KP (base64url, 32 bytes), once a passkey exists
  passkeys?: Record<string, { label: string; added: string }>
}

type VaultArchive = {
  version: 3
  updatedAt: string
  fileDek?: string           // base64 32-byte file DEK — packed body only
  keys?: VaultKeysSection    // packed body only
  root: FsDir
  recycleBin?: RecycleBinEntry[]
}
```

- Folder and file names are the keys in `entries` (paths look like `passwords/github.json`).
- The React payload strips `fileDek` and `keys`; the session keeps them outside React state (the file DEK as a non-extractable `CryptoKey`).
- Empty vaults seed four directories: `passwords/`, `auth-keys/`, `wallets/`, `notes/`. Extra dirs and files are allowed.
- Name segments must not be empty, `.`, `..`, or contain `/` or `\`.
- `icon` absent (or a default id) means the plain folder / document artwork; the four seed folders fall back to their seed icons by name.
- The **Trash** (stored as `recycleBin`; called Recycle Bin in older versions) is archive metadata, not a folder in `root`. Soft-delete moves a file or whole folder tree into a bin entry; restore puts it back at `originalPath` (or `name (restored)` if taken); purge removes the entry forever. Missing `recycleBin` is treated as `[]`.
- File bodies are KeePass-style account entries (`src/lib/account/schema.ts`):
  title, username, password, URL, recovery email/keys, notes, TOTP/HOTP.

## Key hierarchy

```text
A        = Argon2id(NFKC(password), salt16, m=64 MiB, t=3, p=1)   (params stored in the header)
authKey  = HKDF(A, "CK3/auth")    → sent to the server (verifier: HMAC(k_ver, vaultId ‖ authKey))
pwKey    = HKDF(A, "CK3/pw")      → never leaves the browser

VK       random 256-bit vault key;  bodyKey = HKDF(VK, "CK3/body")
slots wrap VK with AES-256-GCM (AAD "CK3/slot/<type>/<vaultId>"):
  primary  KEK = HKDF(pwKey ‖ SK ‖ P [‖ KP], salt=vaultId, "CK3/kek/primary[+pk]")
  email    KEK = HKDF(pwKey ‖ E [‖ KP],      salt=vaultId, "CK3/kek/email[+pk]")
  recovery KEK = HKDF(R,                     salt=vaultId, "CK3/kek/recovery")
           rkAuth = HKDF(R, "CK3/rk-auth") → server (verifier)
passkeys: KP wrapped per credential with HKDF(PRF output, salt=vaultId, "CK3/passkey")
file DEK  random 256-bit, inside the body; each file: AES-256-GCM, random 96-bit nonce
```

| Secret | Size | Lives |
| --- | --- | --- |
| Master password | — | Typed only; never stored, never sent |
| Secret Key `SK1-…` | 128-bit | Emergency Kit, vault body, trusted devices (30 days) |
| Recovery Key `RK1-…` | 256-bit | Emergency Kit only |
| Server share P / E | 256-bit | Sealed in the vault object's metadata; released by `/unlock` (E only with an email link) |
| Passkey key KP | 256-bit | Vault body; wrapped by each enrolled passkey's PRF output |

Every re-key mints fresh P (and E), so older blobs, backups and devices stop
opening once the password changes.

## CKV3 container

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | Magic `CKV3` |
| 4 | 1 | Format `1` |
| 5 | 4 | Header length `H` (u32 LE, 2..65536) |
| 9 | H | Header JSON (UTF-8) |
| 9+H | 12 | Body nonce |
| 21+H | rest | AES-256-GCM(bodyKey) ciphertext + tag; AAD = bytes `[0, 9+H)` |

```ts
type Ckv3Header = {
  v: 1
  purpose: "vault" | "export"
  vaultId: string                 // base64url 16 bytes
  rev: number                     // +1 on every save (server-enforced)
  kdf?: { alg: "argon2id"; v: 19; m: number; t: number; p: number; salt: string } // vaults only
  requirePasskey?: true
  slots: { type: "primary" | "email" | "recovery"; n: string; ct: string }[]
  passkeys?: { id: string; salt: string; n: string; ct: string }[]
}
```

Decoding is strict (key whitelist, exact lengths, `m` 19–256 MiB, `t` 1–10,
`p` 1–4, blob ≤ 3.5 MiB). The body plaintext is `u32 length ‖ CKZ1 pack`,
zero-padded to a multiple of 16 KiB.

### CKZ1 pack (inside the body)

`CKZ1` ‖ uncompressed length (u32 LE, ≤ 32 MiB) ‖ deflate-raw bytes with a
reversible scramble (obfuscation only). Inflate stops as soon as the output
exceeds the declared length.

## Export and import files (`.ckx`)

Same container with `purpose: "export"` and only a recovery slot:

- **In-app export** (Keep menu → Export Vault…): the vault's id, VK and recovery slot;
  workspace only (no Recycle Bin, no `keys`). Opens with this vault's
  Recovery Key, or directly in the same vault.
- **CLI import file** (`npm run ck-file`): a fresh vault id/VK and a random
  one-time import key (`RK1-…`, printed once); keeps the Recycle Bin.

Import re-encrypts every file under the live file DEK, into a new
"Imported <date>" folder or merged into the top level.

## Legacy formats

`CKV2`/`CKV1` (password + public pepper, no slots) and plaintext v2 archives
are read only by `ck-file from-legacy` (`scripts/lib/legacyCkv2.ts`). The app
itself no longer contains code for them.
