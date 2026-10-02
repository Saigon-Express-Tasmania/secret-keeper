# Screens

The app has three routes.

| Route | Screen | Purpose |
| --- | --- | --- |
| `/` | Gate | Unlock, create a vault, or recover with the Recovery Key |
| `/verify` | Gate (sign-in link) | Finish an emailed sign-in link: `/verify#v=<vault>&t=<token>` |
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
link" (when the vault has a confirmed address and no authenticator app), or
"Use Recovery Key". Shown only off-device. With an authenticator app the code
is always required; a link cannot replace it.

**Check your email** — after "Email me a sign-in link": the masked address,
"works once, for 15 minutes", open it on the device to unlock.

**Finish signing in** (`/verify`) — the page reads the vault name and token
from the URL fragment, then removes them from the address bar and history.
It asks for the master password (and the authenticator code when on, as a
second-factor step) with "Trust this device" ticked by default. With email
unlock the vault opens without the Secret Key and a trusted device keeps it
from then on; otherwise the Secret Key step follows. A used or expired link
shows "This sign-in link is incomplete or was already opened".

The **Secret Key** step also offers "Email me a link instead" when the vault
has email unlock.

**Use your passkey** — when the vault requires a passkey, after the Secret
Key is settled: "Use passkey" starts WebAuthn from the click (browsers need
the gesture). One touch is remembered for the rest of the attempt, so a
mistyped Secret Key does not ask again. A cancelled prompt or a passkey that
does not belong to the vault shows an error; "Use Recovery Key" always works.

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

The unlocked vault looks and behaves like a macOS **Finder** window on a desktop. Appearance follows the system Light/Dark setting (`prefers-color-scheme`); there is no in-app toggle.

**UI (≥ 768px wide):**

- **Desktop:** the Gate photo as an unblurred wallpaper, with a macOS-style **menu bar** on top: app menu **Keep** (About, Change Master Password…, Export Vault…, Import Vault…, Lock Vault), **File**, **Edit**, **View**, **Go**, **Window**, **Help** (Keyboard Shortcuts). On the right: a save indicator, a Lock button and the clock.
- **Window:** traffic lights — red **locks** the vault (after any save in flight; a dot in it means the open account has unsaved edits), yellow **minimizes** the window to a vault icon on the desktop (double-click to restore; the window stays mounted so edits survive), green **zooms** to fill the screen (remembered). Double-clicking the toolbar also zooms.
- **Sidebar** (translucent, resizable, can be hidden): *Favorites* — the vault root (named after the vault) and its top-level folders, shown with tinted symbols; *Locations* — **Trash** with an item count.
- **Toolbar:** sidebar toggle, Back / Forward, the title (folder name, “Searching “…””, Trash, or the open file with “— Edited”), the **Icons / List / Columns** switcher, Sort By menu, the ⋯ action menu, the **Show Credentials** eye toggle and the search field.
- **Content:** the current folder in the chosen view, search results, the Trash, or the account editor when a file is open.
- **Path bar** (selected item’s path, else the current folder; segments are clickable and accept drops) and **status bar** (“3 of 12 selected”, save status, icon-size slider in Icons view). Both can be hidden from the View menu.

**UI (narrow screens):** no menu bar or traffic lights; the window fills the screen, the sidebar is a drawer, and the ⋯ menu carries every command (including View, Go, Vault and **Select** mode for multi-selecting by tapping). Tapping an item opens it; long-press opens its context menu. Drag and drop is mouse/trackpad only.

**Views:**

- **Icons:** Big Sur–style folder and document artwork with the item’s custom icon drawn on it; label and optional *item info* line (folder item count; file size, or the username when credentials are shown). Icon size slider 32–128 px.
- **List:** Name, Date Modified, Size (folders “--” unless *Calculate All Sizes*), Kind, optional Date Created; *Where* in search results; *Original Location* and *Date Deleted* in the Trash. Folders expand inline with disclosure triangles (⌥-click expands all). Click a header to sort; columns drop off as the window narrows.
- **Columns:** Miller columns from the vault root to the current folder. Selecting a folder opens it in the next column; selecting an account shows a preview pane (with an Open button).
- Sorting is Finder’s natural order (“file2” before “file10”) with **Keep Folders on Top** on by default. Kind is “Folder” or “Account”; dates read “Today at 9:41 AM”.

**Selection and opening:** click selects; ⌘-click (Ctrl elsewhere) toggles; Shift-click extends; clicking empty space deselects; arrow keys move (grid-aware in Icons, ←/→ change columns or expand/collapse in List); typing jumps to a name. **Double-click** (or ⌘O / ⌘↓) opens: a folder navigates, an account opens in the editor inside the window, a Trash item explains it must be put back first. Going up (⌘↑, Back to a parent) re-selects the folder you came from. Right-clicking an unselected item selects it first.

**Account editor** (file open): replaces the content area; Back/⌘[ returns to the folder with the file selected. The file body is decrypted on open and cleared when you leave or lock. Sections are grouped like System Settings. **Save** (⌘S) re-encrypts the file and saves the vault. Leaving with unsaved edits (Back, Lock, navigating, or changing an ancestor folder of the file) asks *Do you want to save the changes you made to “name”?* — **Save / Don’t Save / Cancel** — after waiting for any save already in flight. The tab warns before closing while saving or with unsaved edits.

**Creating and renaming:** **New Folder** (⌥⌘N) and **New Account** (⌥⇧⌘N) add an “untitled folder” / “untitled.json” placeholder in rename mode; Return or clicking away creates it (one save), Escape cancels. “.json” is added to account names without an extension; the new account then opens in the editor. **Return** (or F2 off-Mac) renames the selected item inline, selecting the name without its extension. Invalid or taken names show an alert and keep the field open. Icons are changed afterwards with **Change Icon…** or **Get Info** (*Use Default Icon* resets them).

**Edit and move:** ⌘C / ⌘X / ⌘V use an in-app clipboard (never the system clipboard); cut items are dimmed; **Paste Into Folder** from a folder’s context menu. **Duplicate** (⌘D) copies into the same folder as “name (copy)”. **Drag and drop** moves items onto folders in any view, sidebar folders, path-bar segments or the view background; hold ⌥ (Ctrl elsewhere) to copy; dropping on **Trash** trashes. Drops into an item itself or a descendant, or onto the folder it is already in, are refused. Name clashes on move/copy get “(copy)”.

**Trash:** ⌘⌫ (Delete off-Mac) moves the selection to the Trash with no confirmation (whole folder trees as one item). In the Trash: **Put Back** (⌘⌫) restores to the original path (or “name (restored)”), **Delete Immediately…** (⌥⌘⌫ / Shift+Delete) and **Empty Trash…** (header button or ⇧⌘⌫) ask for confirmation, then purge. Trash items can’t be renamed, cut, dragged or opened, and are never decrypted.

**Search:** ⌘F focuses the field; matches names and ancestor folder names only and never decrypts contents. A scope bar chooses the whole vault or the folder the search started in (that folder’s own name doesn’t count as a match). Results show in Icons or List; Escape clears.

**Show Credentials** (eye toggle, View menu, ⇧⌘.) decrypts the **visible** account files only — the current listing, search results, the Column preview, or the Quick Look target — and adds Username, Password (masked; reveal/copy) and live One-Time Code columns in List view. Off by default; remembered as `ck:decrypt-listing`.

**Quick Look** (Space) shows a floating, non-modal preview of the focused item that follows the selection: icon, kind, size, dates, and — with Show Credentials on — title, username, masked password, one-time code and website. **Get Info** (⌘I) shows kind, encrypted size, location and dates (Trash: original location and date deleted) and the icon controls.

**Saving:** every change re-encrypts and uploads the whole vault. One save runs at a time; commands that change the vault are disabled while it runs, affected items are dimmed, and the menu bar and status bar show *Saving…*. Failures show an alert (“The operation can’t be completed.”).

**Keyboard shortcuts** (⌘ on macOS, Ctrl elsewhere; Help ▸ Keyboard Shortcuts lists them):

| Command | macOS | Windows / Linux |
| --- | --- | --- |
| New Folder / New Account | ⌥⌘N / ⌥⇧⌘N | Ctrl+Alt+N / Ctrl+Alt+Shift+N |
| Open | ⌘O, ⌘↓, double-click | Ctrl+O, Ctrl+↓ |
| Rename | Return | Enter, F2 |
| Quick Look / Get Info / Duplicate | Space / ⌘I / ⌘D | Space / Ctrl+I / Ctrl+D |
| Move to Trash (Put Back in Trash) | ⌘⌫ | Delete |
| Delete Immediately / Empty Trash | ⌥⌘⌫ / ⇧⌘⌫ | Shift+Delete / menu |
| Cut / Copy / Paste / Select All | ⌘X ⌘C ⌘V ⌘A | Ctrl+X C V A |
| Find / Save | ⌘F / ⌘S | Ctrl+F / Ctrl+S |
| Icons / List / Columns | ⌘1 / ⌘2 / ⌘3 | Ctrl+1 / 2 / 3 |
| Back / Forward / Enclosing Folder | ⌘[ / ⌘] / ⌘↑ | Ctrl+[ / ] / ↑ |
| Vault root | ⇧⌘H | Ctrl+Shift+H |
| Show Credentials | ⇧⌘. | Ctrl+Shift+. |
| Sidebar / Path Bar / Status Bar | ⌃⌘S / ⌥⌘P / ⌘/ | Ctrl+Alt+S / Ctrl+Alt+P / Ctrl+/ |

Some Finder shortcuts are reserved by browsers (⇧⌘N, ⌘N, ⌘W, ⌃⌘Q); they have alternates above or live in the menus. ⌘1–3 and ⇧⌘⌫ may be taken by the browser in some cases; the toolbar and menus always work. Shortcuts don’t fire while typing in a text field (except ⌘S, ⌘F, ⌘[ and ⌘]).

**Other behavior:**

- Requires an unlocked archive; otherwise redirects to Gate. Opens at the first top-level folder (alphabetically).
- **Lock** (also idle timeout, `pagehide`, ended session) wipes the session keys and any open-file plaintext, clears a copied secret from the clipboard, then returns to Gate. A save that finishes after locking is discarded and never re-opens the vault.
- **Security…** (Keep menu) replaces the old Change Master Password item; see below.
- **Export** downloads a `.ckx` file that opens with this vault's Recovery Key. **Import** takes a `.ckx` plus a Recovery Key or one-time import key (empty for this vault's own exports); an import lands in a new “Imported YYYY-MM-DD” folder (or the root), which opens. Old `.ckv` files must be converted with `npm run ck-file -- from-legacy`.
- Saves upload the next revision with `If-Match`; if another device saved first, the latest version is fetched and the change is replayed once.
- Copy buttons wipe the clipboard after 30 s (or on the next focus if the tab was in the background).
- Layout preferences (view, sort, icon size, sidebar width/visibility, path/status bars, zoom) persist in `localStorage` as `ck:finder`. They never include vault names or paths, and paths never appear in the URL or page title.

## Security dialog

Keep menu → **Security…** (⋯ menu on narrow screens). Every change asks for the master password again (step-up).

| Section | Actions |
| --- | --- |
| Master password | Change it: re-wraps the slots, rotates the server shares (old copies stop opening), ends other sessions, optionally signs out trusted devices |
| Two-step verification | **Set up authenticator app**: QR code + key to type, code from the app, master password, "Trust this device" (other devices lose trust). **Turn off**: current code + master password, or the Recovery Key alone |
| Email | **Add / Change**: address + master password, then the 6-digit code mailed to it (the old address keeps working until then and is told about the change). **Remove** (only with email unlock off). **Email unlock** on/off: re-keys the vault to add or drop the email slot |
| Passkeys | Shown when the browser supports passkeys. **Add passkey**: name + master password (checked first), then "Create passkey". **Require passkey** / **Stop requiring**. **Remove** (not the last one while required) |
| Emergency Kit | Show Secret Key (password checked by the server); New Secret Key; New Recovery Key (each shows the new kit once) |
| Rotate all keys | Master password + "Also sign out all trusted devices": new vault key, file key, Secret Key, Recovery Key and server shares; every file re-encrypted; shows the new kit |
| This device | Whether it remembers the Secret Key and skips the second factor (and until when); Forget this device |
| Trusted devices | Every trusted device (label, trusted since, until), "this device" marked; Revoke one; Revoke all |
| Auto-lock | Minutes of inactivity before locking (1–60, per device, default 10) |

The dialog loads the vault's factors and devices from the server when it
opens.

## Routing guard

`VaultContext` holds the session `VaultArchive` (encrypted file bodies only, or `null` when locked). Key material (vault key, file DEK, Secret Key) lives in a `VaultSession` object outside React state; the master password is never kept after the unlock step that needs it.
