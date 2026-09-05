# Screens

The app has exactly two routes.

| Route | Screen | Purpose |
| --- | --- | --- |
| `/` | Gate | Unlock with master password |
| `/dashboard` | Dashboard | Browse / create folders and files in the unlocked vault |

Unknown paths redirect to `/`.

## Gate

**UI:** centered card, master password field, Unlock button; loading state (“Unlocking…”) and error text.

**Behavior:**

1. Create storage strategy from env
2. `download(VITE_VAULT_OBJECT_KEY)` (null if missing)
3. Load local ciphertext cache
4. Decrypt available blobs with master password + `VITE_VAULT_SALT_KEY`
5. `mergeVaults` (currently prefers remote)
6. Migrate to archive v3 (per-file encryption) if needed; re-upload when migrated
7. Persist chosen ciphertext locally; upload if remote was missing / create empty vault
8. Store session payload (names + file ciphertext), file DEK (CryptoKey + bytes in refs), and master password in `VaultContext`
9. Navigate to Dashboard (show error if download/decrypt fails)

If already unlocked, visiting `/` redirects to `/dashboard`.

## Dashboard

**UI:** full-height file explorer:

- **Top bar:** breadcrumb, search (name / folder path only), New folder, New file (hidden in Recycle Bin), Lock
- **Left sidebar:** root folders + **Recycle Bin** (count badge)
- **Main pane:** folder listing, account file editor, search results, or Recycle Bin listing

**Behavior:**

- Requires unlocked archive; otherwise redirects to Gate
- Clicking a folder lists its children (subfolders + files)
- Clicking a file decrypts that one body into editor-local state (AES-GCM under the file DEK); plaintext is cleared on navigate away or Lock
- The file editor is KeePass-style (`type: "account"`): title, description, username, password, URL, recovery email/keys, notes, and TOTP/HOTP settings with a live code generator
- Save re-encrypts the file and packs/uploads the vault blob; leaving with unsaved edits prompts Save / Discard / Cancel
- Search matches file/folder names and ancestor path segments — never decrypts file contents
- Create folder / file targets the current directory (parent if a file is open), then `commit` / `putEncryptedFile` → pack → CKV2 encrypt → upload + local cache
- New files are seeded as an empty `account` entry (not `{}`)
- **Multi-select:** checkboxes on listing / search rows; when items are selected, **Delete** moves them to Recycle Bin (whole folder trees as one item). No confirm on soft-delete.
- **Recycle Bin:** restore selected items to their original paths (or `name (restored)` if conflict); **Delete forever** asks for confirmation then purges. Files are not opened from the bin — restore first.
- Lock clears payload, master password, DEK refs, and any open-file plaintext, then returns to Gate

## Routing guard

`VaultContext` holds the session `VaultArchive` (encrypted file bodies only, or `null` when locked). The file DEK is not part of the React payload object.
