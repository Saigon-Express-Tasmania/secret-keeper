import type { FinderController } from "@/components/dashboard/hooks/useFinderController"
import type { Shortcut } from "@/lib/finder/shortcuts"
import type { FinderItem, SortKey, ViewMode } from "@/lib/finder/types"
import { parentPath } from "@/lib/vault/fs"

/** Context a command runs against: the controller plus its target items. */
export type CmdCtx = { c: FinderController; items: FinderItem[] }

export type CommandSpec = {
  label: string | ((x: CmdCtx) => string)
  /** First applicable shortcut is shown in menus; the rest are aliases. */
  shortcuts?: Shortcut[]
  /** Handled by the focused view (Return, Space), never the global listener. */
  viewKey?: boolean
  /** Still fires while typing in a text field (e.g. ⌘S, ⌘F, ⌘[). */
  allowInEditable?: boolean
  enabled?: (x: CmdCtx) => boolean
  checked?: (x: CmdCtx) => boolean
  /** Changes the vault: disabled while a save is in flight. */
  mutates?: boolean
  run: (x: CmdCtx) => void | Promise<unknown>
}

const vaultItems = (x: CmdCtx) => x.items.filter((i) => i.source === "vault")
const trashItems = (x: CmdCtx) => x.items.filter((i) => i.source === "trash")
const one = (x: CmdCtx) => (x.items.length === 1 ? x.items[0]! : null)
const browsing = (x: CmdCtx) => x.c.model.mode === "folder" || x.c.model.mode === "search"
const named = (verb: string, x: CmdCtx, fallback = verb) => {
  const n = x.items.length
  if (n === 0) return fallback
  return n === 1 ? `${verb} “${x.items[0]!.name}”` : `${verb} ${n} Items`
}

function setView(view: ViewMode): CommandSpec {
  const labels = { icons: "as Icons", list: "as List", columns: "as Columns" }
  const keys = { icons: "1", list: "2", columns: "3" }
  return {
    label: labels[view],
    shortcuts: [{ key: keys[view], code: `Digit${keys[view]}`, mod: true }],
    enabled: (x) =>
      x.c.model.mode !== "file" &&
      !(view === "columns" && (x.c.model.mode === "search" || x.c.model.mode === "trash")),
    checked: (x) => x.c.model.view === view,
    run: (x) => x.c.setPrefs({ view }),
  }
}

function sortBy(key: SortKey, label: string): CommandSpec {
  return {
    label,
    enabled: (x) => x.c.model.mode !== "file" && (key !== "deleted" || x.c.model.mode === "trash"),
    checked: (x) => x.c.model.sort.key === key,
    run: (x) => {
      const dir = key === "name" || key === "kind" ? "asc" : "desc"
      if (x.c.model.mode === "trash") x.c.setPrefs({ trashSort: { key, dir } })
      else x.c.setPrefs({ sort: { key, dir } })
    },
  }
}

function toggle(
  label: string,
  pref: "foldersOnTop" | "showItemInfo" | "showCreated" | "calculateSizes" | "sidebar" | "pathBar" | "statusBar",
  shortcuts?: Shortcut[]
): CommandSpec {
  return {
    label,
    shortcuts,
    checked: (x) => x.c.prefs[pref],
    run: (x) => x.c.setPrefs({ [pref]: !x.c.prefs[pref] }),
  }
}

export const COMMANDS = {
  // ── App ──────────────────────────────────────────────────────────────
  "app.about": {
    label: "About Keep",
    run: (x) =>
      x.c.alerts.alert({
        title: "Credentials Keep",
        message:
          "A client-side encrypted vault. Everything is encrypted in this browser before it is stored.",
      }),
  },
  "app.changePassword": {
    label: "Change Master Password…",
    mutates: true,
    run: (x) => x.c.dialogs.setChangePasswordOpen(true),
  },
  "app.export": {
    label: "Export Vault…",
    enabled: (x) => !x.c.dialogs.exporting,
    run: (x) => x.c.exportVault(),
  },
  "app.import": {
    label: "Import Vault…",
    mutates: true,
    run: (x) => x.c.dialogs.setImportOpen(true),
  },
  "app.lock": {
    label: (x) => (x.c.win.lockPending ? "Locking after save…" : "Lock Vault"),
    enabled: (x) => !x.c.win.lockPending,
    run: (x) => x.c.requestLock(),
  },

  // ── File ─────────────────────────────────────────────────────────────
  "file.newFolder": {
    label: "New Folder",
    shortcuts: [{ key: "n", code: "KeyN", mod: true, alt: true }],
    mutates: true,
    enabled: (x) => x.c.model.mode === "folder" || x.c.model.mode === "file",
    run: (x) => x.c.startNew("folder"),
  },
  "file.newAccount": {
    label: "New Account",
    shortcuts: [{ key: "n", code: "KeyN", mod: true, alt: true, shift: true }],
    mutates: true,
    enabled: (x) => x.c.model.mode === "folder" || x.c.model.mode === "file",
    run: (x) => x.c.startNew("file"),
  },
  "file.open": {
    label: "Open",
    shortcuts: [
      { key: "o", code: "KeyO", mod: true },
      { key: "arrowdown", mod: true },
    ],
    enabled: (x) => x.c.model.mode !== "file" && x.items.length > 0,
    run: (x) => x.c.openItem(x.items[0]!),
  },
  "file.save": {
    label: "Save",
    shortcuts: [{ key: "s", code: "KeyS", mod: true }],
    allowInEditable: true,
    enabled: (x) => x.c.model.mode === "file" && x.c.editor.dirty,
    run: (x) => x.c.editor.ref.current?.save(),
  },
  "file.getInfo": {
    label: "Get Info",
    shortcuts: [{ key: "i", code: "KeyI", mod: true }],
    run: (x) => x.c.showInfo(x.items[0] ?? null),
  },
  "file.rename": {
    label: "Rename",
    shortcuts: [{ key: "enter" }, { key: "f2", platform: "other" }],
    viewKey: true,
    mutates: true,
    enabled: (x) => one(x)?.source === "vault",
    run: (x) => x.c.startRename(x.items[0]!),
  },
  "file.duplicate": {
    label: "Duplicate",
    shortcuts: [{ key: "d", code: "KeyD", mod: true }],
    mutates: true,
    enabled: (x) => vaultItems(x).length > 0,
    run: (x) => x.c.duplicate(x.items),
  },
  "file.changeIcon": {
    label: "Change Icon…",
    mutates: true,
    enabled: (x) => one(x)?.source === "vault",
    run: (x) => x.c.dialogs.setIconTarget(x.items[0]!),
  },
  "file.quickLook": {
    label: (x) => named("Quick Look", x),
    shortcuts: [{ key: " " }],
    viewKey: true,
    enabled: (x) => x.c.model.mode !== "file" && x.items.length > 0,
    run: (x) => x.c.dispatch({ type: "quickLook" }),
  },
  "file.moveToTrash": {
    label: "Move to Trash",
    shortcuts: [
      { key: "backspace", mod: true, platform: "mac" },
      { key: "delete", platform: "other" },
    ],
    mutates: true,
    enabled: (x) => x.c.model.mode !== "trash" && vaultItems(x).length > 0,
    run: (x) => x.c.moveToTrash(x.items),
  },
  "file.putBack": {
    label: "Put Back",
    shortcuts: [
      { key: "backspace", mod: true, platform: "mac" },
      { key: "delete", platform: "other" },
    ],
    mutates: true,
    enabled: (x) => x.c.model.mode === "trash" && trashItems(x).length > 0,
    run: (x) => x.c.putBack(x.items),
  },
  "file.deleteImmediately": {
    label: "Delete Immediately…",
    shortcuts: [
      { key: "backspace", code: "Backspace", mod: true, alt: true, platform: "mac" },
      { key: "delete", shift: true, platform: "other" },
    ],
    mutates: true,
    enabled: (x) => x.c.model.mode === "trash" && trashItems(x).length > 0,
    run: (x) => x.c.deleteImmediately(x.items),
  },
  "file.emptyTrash": {
    label: "Empty Trash…",
    shortcuts: [{ key: "backspace", mod: true, shift: true, platform: "mac" }],
    mutates: true,
    enabled: (x) => (x.c.archive.recycleBin?.length ?? 0) > 0,
    run: (x) => x.c.emptyTrash(),
  },
  "file.find": {
    label: "Find",
    shortcuts: [{ key: "f", code: "KeyF", mod: true }],
    allowInEditable: true,
    enabled: (x) => x.c.model.mode !== "trash",
    run: (x) => {
      x.c.searchRef.current?.focus()
      x.c.searchRef.current?.select()
    },
  },

  // ── Edit ─────────────────────────────────────────────────────────────
  "edit.cut": {
    label: (x) => named("Cut", x),
    shortcuts: [{ key: "x", code: "KeyX", mod: true }],
    enabled: (x) => browsing(x) && vaultItems(x).length > 0,
    run: (x) => x.c.setClipboard("cut", x.items),
  },
  "edit.copy": {
    label: (x) => named("Copy", x),
    shortcuts: [{ key: "c", code: "KeyC", mod: true }],
    enabled: (x) => browsing(x) && vaultItems(x).length > 0,
    run: (x) => x.c.setClipboard("copy", x.items),
  },
  "edit.paste": {
    label: (x) => {
      const n = x.c.state.clipboard?.paths.length ?? 0
      return n > 1 ? `Paste ${n} Items` : "Paste Item"
    },
    shortcuts: [{ key: "v", code: "KeyV", mod: true }],
    mutates: true,
    enabled: (x) => x.c.model.mode === "folder" && !!x.c.state.clipboard,
    run: (x) => x.c.paste(x.c.model.containerDir),
  },
  "edit.pasteInto": {
    label: "Paste Into Folder",
    mutates: true,
    enabled: (x) => !!x.c.state.clipboard && one(x)?.kind === "dir" && one(x)?.source === "vault",
    run: (x) => x.c.paste(x.items[0]!.path),
  },
  "edit.selectAll": {
    label: "Select All",
    shortcuts: [{ key: "a", code: "KeyA", mod: true }],
    enabled: (x) => x.c.model.mode !== "file" && x.c.model.orderedKeys.length > 0,
    run: (x) => x.c.dispatch({ type: "selectAll", ordered: x.c.model.orderedKeys }),
  },

  // ── View ─────────────────────────────────────────────────────────────
  "view.icons": setView("icons"),
  "view.list": setView("list"),
  "view.columns": setView("columns"),
  "view.sortName": sortBy("name", "Name"),
  "view.sortKind": sortBy("kind", "Kind"),
  "view.sortModified": sortBy("modified", "Date Modified"),
  "view.sortCreated": sortBy("created", "Date Created"),
  "view.sortSize": sortBy("size", "Size"),
  "view.sortDeleted": sortBy("deleted", "Date Deleted"),
  "view.foldersOnTop": toggle("Keep Folders on Top", "foldersOnTop"),
  "view.itemInfo": toggle("Show Item Info", "showItemInfo"),
  "view.showCreated": toggle("Show Date Created", "showCreated"),
  "view.calculateSizes": toggle("Calculate All Sizes", "calculateSizes"),
  "view.showCredentials": {
    label: "Show Credentials",
    shortcuts: [{ key: ".", code: "Period", mod: true, shift: true }],
    checked: (x) => x.c.showCredentials,
    run: (x) => x.c.setShowCredentials(!x.c.showCredentials),
  },
  "view.sidebar": toggle("Show Sidebar", "sidebar", [
    { key: "s", code: "KeyS", mod: true, ctrl: true, platform: "mac" },
    { key: "s", code: "KeyS", mod: true, alt: true, platform: "other" },
  ]),
  "view.pathBar": toggle("Show Path Bar", "pathBar", [{ key: "p", code: "KeyP", mod: true, alt: true }]),
  "view.statusBar": toggle("Show Status Bar", "statusBar", [{ key: "/", code: "Slash", mod: true }]),

  // ── Go ───────────────────────────────────────────────────────────────
  "go.back": {
    label: "Back",
    shortcuts: [{ key: "[", code: "BracketLeft", mod: true }],
    allowInEditable: true,
    enabled: (x) => x.c.model.canGoBack,
    run: (x) => x.c.goBack(),
  },
  "go.forward": {
    label: "Forward",
    shortcuts: [{ key: "]", code: "BracketRight", mod: true }],
    allowInEditable: true,
    enabled: (x) => x.c.model.canGoForward,
    run: (x) => x.c.goForward(),
  },
  "go.enclosing": {
    label: "Enclosing Folder",
    shortcuts: [{ key: "arrowup", mod: true }],
    enabled: (x) =>
      x.c.model.mode === "file" || (x.c.model.mode === "folder" && x.c.model.path !== ""),
    run: (x) => {
      const m = x.c.model
      const target = m.mode === "file" ? parentPath(m.path) : parentPath(m.path)
      return x.c.navigate({ kind: "path", path: target })
    },
  },
  "go.vault": {
    label: (x) => x.c.vaultName,
    shortcuts: [{ key: "h", code: "KeyH", mod: true, shift: true }],
    run: (x) => x.c.navigate({ kind: "path", path: "" }),
  },
  "go.trash": {
    label: "Trash",
    run: (x) => x.c.navigate({ kind: "trash" }),
  },

  // ── Window / Help ────────────────────────────────────────────────────
  "window.minimize": {
    label: "Minimize",
    enabled: (x) => !x.c.win.minimized,
    run: (x) => x.c.win.setMinimized(true),
  },
  "window.zoom": {
    label: (x) => (x.c.prefs.zoomed ? "Restore Window Size" : "Zoom"),
    run: (x) => x.c.setPrefs({ zoomed: !x.c.prefs.zoomed }),
  },
  "window.restore": {
    label: (x) => x.c.vaultName,
    checked: (x) => !x.c.win.minimized,
    run: (x) => {
      x.c.win.setMinimized(false)
      x.c.focusContent()
    },
  },
  "help.shortcuts": {
    label: "Keyboard Shortcuts",
    shortcuts: [{ key: "?", code: "Slash", mod: true, shift: true }],
    run: (x) => x.c.dialogs.setShortcutsOpen(true),
  },
} satisfies Record<string, CommandSpec>

export type CommandId = keyof typeof COMMANDS

/** Commands checked by the global keyboard listener, in priority order. */
export const SHORTCUT_COMMANDS = (Object.keys(COMMANDS) as CommandId[]).filter(
  (id) => {
    const spec: CommandSpec = COMMANDS[id]
    return !!spec.shortcuts?.length && !spec.viewKey
  }
)
