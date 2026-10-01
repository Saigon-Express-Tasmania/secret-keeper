# Screens

The app has exactly two routes.

| Route | Screen | Purpose |
| --- | --- | --- |
| `/` | Gate | Unlock with vault name + master password |
| `/dashboard` | Dashboard | Browse / create folders and files in the unlocked vault |

Unknown paths redirect to `/`.

## Gate

**UI:** centered card, vault name field (placeholder hint `vault`), master password field, Unlock button; loading state (“Unlocking…”) and error text. Name + password use browser autofill (`username` / `current-password`).

**Behavior:**

1. Create storage strategy from env
2. Derive object key from vault name (`toVaultObjectKey` — appends `.enc` when missing)
3. `download(objectKey)` (null if missing)
4. Load local ciphertext cache
5. Decrypt available blobs with master password + `VITE_VAULT_SALT_KEY`
6. `mergeVaults` (currently prefers remote)
7. Migrate to archive v3 (per-file encryption) if needed; re-upload when migrated
8. Persist chosen ciphertext locally; upload if remote was missing / create empty vault
9. Store session payload (names + file ciphertext), file DEK (CryptoKey + bytes in refs), object key, and master password in `VaultContext`
10. Navigate to Dashboard (show error if download/decrypt fails)

If already unlocked, visiting `/` redirects to `/dashboard`.

## Dashboard

**UI:** full-height file explorer:

- **Top bar:** breadcrumb, search (name / folder path only), New folder, New file (hidden in Recycle Bin), Change password, Lock
- **Left sidebar:** root folders + **Recycle Bin** (count badge)
- **Main pane:** folder listing, account file editor, search results, or Recycle Bin listing
- **Folder listing views:** **List** (details table) or **Grid** (one card per file/folder: icon, title, credentials when Decrypt listing is on, modified date, size). Toggle via **Tools → View** or right-click → **View**; the choice is remembered per browser (`ck:listing-view`)

**Behavior:**

- Requires unlocked archive; otherwise redirects to Gate
- Clicking a folder lists its children (subfolders + files)
- Clicking a file decrypts that one body into editor-local state (AES-GCM under the file DEK); plaintext is cleared on navigate away or Lock
- The file editor is KeePass-style (`type: "account"`): title, description, username, password, URL, recovery email/keys, notes, and TOTP/HOTP settings with a live code generator. OTP settings can be imported from a QR image (paste / drop / browse), and a TOTP can be shown as a setup QR code for authenticator apps (copy image, download PNG, or copy the `otpauth://` link)
- Save re-encrypts the file and packs/uploads the vault blob; leaving with unsaved edits prompts Save / Discard / Cancel
- Search matches file/folder names and ancestor path segments — never decrypts file contents
- Create folder / file targets the current directory (parent if a file is open), then `commit` / `putEncryptedFile` → pack → CKV2 encrypt → upload + local cache
- New files are seeded as an empty `account` entry (not `{}`)
- **Multi-select:** checkboxes on listing / search rows; when items are selected, **Delete** moves them to Recycle Bin (whole folder trees as one item). No confirm on soft-delete.
- **Recycle Bin:** restore selected items to their original paths (or `name (restored)` if conflict); **Delete forever** asks for confirmation then purges. Files are not opened from the bin — restore first.
- Lock clears payload, master password, object key, DEK refs, and any open-file plaintext, then returns to Gate
- **Change password** verifies the current master password, re-encrypts the outer CKV2 blob under the new password (file DEK unchanged), updates the session secret, and stays unlocked

## Routing guard

`VaultContext` holds the session `VaultArchive` (encrypted file bodies only, or `null` when locked). The file DEK is not part of the React payload object.
