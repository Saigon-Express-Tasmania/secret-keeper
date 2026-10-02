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
- **Lock** clears payload, master password, object key, DEK refs and any open-file plaintext, then returns to Gate. A save that finishes after locking is discarded and never re-opens the vault.
- **Change Master Password** verifies the current password, re-encrypts the outer CKV2 blob under the new one (file DEK unchanged) and stays unlocked.
- **Export / Import** work as before; an import lands in a new “Imported YYYY-MM-DD” folder, which opens.
- Layout preferences (view, sort, icon size, sidebar width/visibility, path/status bars, zoom) persist in `localStorage` as `ck:finder`. They never include vault names or paths, and paths never appear in the URL or page title.

## Routing guard

`VaultContext` holds the session `VaultArchive` (encrypted file bodies only, or `null` when locked). The file DEK is not part of the React payload object.
