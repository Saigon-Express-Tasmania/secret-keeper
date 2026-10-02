# Screens

The app has exactly two routes.

| Route | Screen | Purpose |
| --- | --- | --- |
| `/` | Gate | Unlock, create a vault, or recover with the Recovery Key |
| `/dashboard` | Dashboard | Browse / create folders and files in the unlocked vault |

Unknown paths redirect to `/`.

## Gate

A centered card that switches between modes and steps (`src/screens/Gate.tsx`,
`src/components/gate/*`). Every step shows typed errors (wrong password,
locked with a wait time, invalid code, network).

**Unlock** — vault name, master password, "Trust this device for 30 days".

1. `POST /prelogin` → KDF parameters (unknown names get stable fake ones)
2. Argon2id in the browser (progress shown) → authKey + pwKey
3. `POST /unlock` with authKey; on an untrusted device the server may answer
   **second factor required** → the second-factor step
4. Open the blob: rollback check against this device's highest seen revision,
   then the primary slot with the Secret Key remembered on this device —
   or ask for it (**Secret Key** step); a wrong key is reported as such
   because the server already verified the password
5. Trusted device: remember the Secret Key and revision for 30 days
6. Hand the session to `VaultContext` → Dashboard

**Second factor** — TOTP code from an authenticator app, "Email me a sign-in
link" (when email is set up), or "Use Recovery Key". Shown only off-device.

**Create a vault** — name (`a-z 0-9 -`), master password twice (≥ 12
characters, not the vault name), the server's setup code, trust checkbox. The
browser generates the vault key, Secret Key, Recovery Key and server share,
uploads the encrypted vault, then shows the **Emergency Kit**.

**Use Recovery Key** — vault name + `RK1-…`. Opens the recovery slot (no
second factor), then forces **Set a new master password** (new Recovery Key
always, new Secret Key and "sign out all trusted devices" by default) and
shows the new Emergency Kit.

**Possible rollback** — shown when the server returns an older revision (or a
different vault) than this trusted device has seen. "Open anyway" only after
restoring a backup on purpose.

**Emergency Kit** — vault name, Secret Key, Recovery Key, copy buttons,
"Download Emergency Kit (.txt)"; continuing requires "I saved my Emergency
Kit somewhere safe".

If already unlocked, visiting `/` redirects to `/dashboard`. Lock reasons
(inactivity, ended session) are shown on the unlock form.

## Dashboard

**UI:** full-height file explorer:

- **Top bar:** breadcrumb, search (name / folder path only), Decrypt listing, New folder, New file (hidden in Recycle Bin), Tools (Export, Import, Security…), Lock
- **Left sidebar:** root folders + **Recycle Bin** (count badge)
- **Main pane:** folder listing, account file editor, search results, or Recycle Bin listing

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
- Lock (button, idle timeout, `pagehide`, ended session) wipes the session keys and any open-file plaintext, clears a copied secret from the clipboard, then returns to Gate
- Copy buttons wipe the clipboard after 30 s (or on the next focus if the tab was in the background)
- Saves upload the next revision with `If-Match`; if another device saved first, the latest version is fetched and the change is replayed once
- **Export** downloads a `.ckx` file that opens with this vault's Recovery Key. **Import** takes a `.ckx` plus a Recovery Key or one-time import key (empty for this vault's own exports); old `.ckv` files must be converted with `npm run ck-file -- from-legacy`

## Security dialog

Tools → Security…. Every change asks for the master password again (step-up).

| Section | Actions |
| --- | --- |
| Master password | Change it: re-wraps the slots, rotates the server shares (old copies stop opening), ends other sessions, optionally signs out trusted devices |
| Emergency Kit | Show Secret Key; New Secret Key; New Recovery Key (each shows the new kit once) |
| This device | Whether it remembers the Secret Key and skips the second factor (and until when); Forget this device |
| Auto-lock | Minutes of inactivity before locking (1–60, per device, default 10) |

## Routing guard

`VaultContext` holds the session `VaultArchive` (encrypted file bodies only, or `null` when locked). Key material (vault key, file DEK, Secret Key) lives in a `VaultSession` object outside React state; the master password is never kept after the unlock step that needs it.
