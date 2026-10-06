import type { CommandId } from "@/components/dashboard/commands"
import type { FinderController } from "@/components/dashboard/hooks/useFinderController"
import type { FinderItem } from "@/lib/finder/types"
import { listRootDirs } from "@/lib/vault/fs"

/** Data description of a menu; rendered by `MenuNodes` for any menu flavour. */
export type MenuNode =
  | { type: "cmd"; id: CommandId; items?: FinderItem[] }
  | {
      type: "action"
      key: string
      label: string
      onSelect: () => void
      disabled?: boolean
      checked?: boolean
    }
  | { type: "sep" }
  | { type: "label"; label: string }
  | { type: "sub"; label: string; children: MenuNode[]; disabled?: boolean }

const sep: MenuNode = { type: "sep" }
const cmd = (id: CommandId, items?: FinderItem[]): MenuNode => ({ type: "cmd", id, items })

export function appMenu(): MenuNode[] {
  return [
    cmd("app.about"),
    sep,
    cmd("app.security"),
    sep,
    cmd("app.export"),
    cmd("app.import"),
    sep,
    cmd("app.lock"),
  ]
}

export function fileMenu(c: FinderController): MenuNode[] {
  const trash = c.model.mode === "trash"
  return [
    cmd("file.newFolder"),
    cmd("file.newAccount"),
    sep,
    cmd("file.open"),
    cmd("file.quickLook"),
    cmd("file.getInfo"),
    sep,
    cmd("file.rename"),
    cmd("file.duplicate"),
    cmd("file.changeIcon"),
    sep,
    ...(trash
      ? [cmd("file.putBack"), cmd("file.deleteImmediately")]
      : [cmd("file.moveToTrash")]),
    cmd("file.emptyTrash"),
    sep,
    cmd("file.find"),
    ...(c.model.mode === "file" ? [sep, cmd("file.save")] : []),
  ]
}

export function editMenu(): MenuNode[] {
  return [cmd("edit.cut"), cmd("edit.copy"), cmd("edit.paste"), sep, cmd("edit.selectAll")]
}

export function sortMenu(c: FinderController): MenuNode {
  return {
    type: "sub",
    label: "Sort By",
    disabled: c.model.mode === "file",
    children: [
      cmd("view.sortName"),
      cmd("view.sortKind"),
      cmd("view.sortModified"),
      cmd("view.sortCreated"),
      cmd("view.sortSize"),
      ...(c.model.mode === "trash" ? [cmd("view.sortDeleted")] : []),
      sep,
      cmd("view.foldersOnTop"),
    ],
  }
}

export function viewMenu(c: FinderController): MenuNode[] {
  return [
    cmd("view.icons"),
    cmd("view.list"),
    cmd("view.columns"),
    cmd("view.cards"),
    sep,
    sortMenu(c),
    sep,
    cmd("view.itemInfo"),
    cmd("view.showCreated"),
    cmd("view.calculateSizes"),
    sep,
    cmd("view.showCredentials"),
    sep,
    cmd("view.sidebar"),
    cmd("view.pathBar"),
    cmd("view.statusBar"),
  ]
}

export function goMenu(c: FinderController): MenuNode[] {
  return [
    cmd("go.back"),
    cmd("go.forward"),
    cmd("go.enclosing"),
    sep,
    cmd("go.vault"),
    ...listRootDirs(c.archive).map(
      ({ name }): MenuNode => ({
        type: "action",
        key: `go:${name}`,
        label: name,
        onSelect: () => void c.navigate({ kind: "path", path: name }),
      })
    ),
    sep,
    cmd("go.trash"),
  ]
}

export function windowMenu(): MenuNode[] {
  return [cmd("window.minimize"), cmd("window.zoom"), sep, cmd("window.restore")]
}

export function helpMenu(): MenuNode[] {
  return [cmd("help.shortcuts")]
}

/** Right-click on one or more selected items. */
export function itemMenu(c: FinderController): MenuNode[] {
  if (c.model.mode === "trash") {
    return [cmd("file.putBack"), cmd("file.deleteImmediately"), sep, cmd("file.getInfo"), cmd("file.quickLook")]
  }
  const single = c.model.selectedItems.length === 1 ? c.model.selectedItems[0]! : null
  return [
    cmd("file.open"),
    sep,
    cmd("file.moveToTrash"),
    sep,
    cmd("file.getInfo"),
    cmd("file.rename"),
    cmd("file.duplicate"),
    cmd("file.changeIcon"),
    cmd("file.quickLook"),
    sep,
    cmd("edit.cut"),
    cmd("edit.copy"),
    ...(single?.kind === "dir" && c.state.clipboard ? [cmd("edit.pasteInto")] : []),
  ]
}

function viewAsMenu(): MenuNode {
  return {
    type: "sub",
    label: "View",
    children: [cmd("view.icons"), cmd("view.list"), cmd("view.columns"), cmd("view.cards")],
  }
}

/** Right-click on empty space. */
export function backgroundMenu(c: FinderController): MenuNode[] {
  if (c.model.mode === "trash") {
    return [cmd("file.emptyTrash"), sep, viewAsMenu(), sortMenu(c)]
  }
  if (c.model.mode === "search") {
    return [viewAsMenu(), sortMenu(c), sep, cmd("view.showCredentials")]
  }
  return [
    cmd("file.newFolder"),
    cmd("file.newAccount"),
    sep,
    cmd("file.getInfo"),
    sep,
    cmd("edit.paste"),
    sep,
    viewAsMenu(),
    sortMenu(c),
    sep,
    cmd("view.showCredentials"),
  ]
}

/** Right-click on a sidebar folder. */
export function sidebarMenu(c: FinderController, item: FinderItem): MenuNode[] {
  return [
    {
      type: "action",
      key: "open",
      label: "Open",
      onSelect: () => void c.navigate({ kind: "path", path: item.path }),
    },
    sep,
    cmd("file.getInfo", [item]),
    cmd("file.changeIcon", [item]),
    ...(c.state.clipboard ? [sep, cmd("edit.pasteInto", [item])] : []),
    sep,
    cmd("file.moveToTrash", [item]),
  ]
}

/** Toolbar ⋯ menu: what a right-click would show. */
export function actionMenu(c: FinderController): MenuNode[] {
  if (c.model.mode === "file") {
    return [cmd("file.save"), sep, cmd("file.getInfo"), cmd("file.rename"), cmd("file.changeIcon"), sep, cmd("file.moveToTrash")]
  }
  return c.model.selectedItems.length > 0 ? itemMenu(c) : backgroundMenu(c)
}

/** Narrow screens have no menu bar: the ⋯ menu carries everything. */
export function mobileMenu(c: FinderController): MenuNode[] {
  const { mode } = c.model
  let base: MenuNode[]
  if (mode === "file" || c.model.selectedItems.length > 0) base = actionMenu(c)
  else if (mode === "folder") base = [cmd("file.newFolder"), cmd("file.newAccount"), sep, cmd("edit.paste"), sep, cmd("file.getInfo")]
  else if (mode === "trash") base = [cmd("file.emptyTrash")]
  else base = []
  return [
    ...base,
    sep,
    { type: "sub", label: "View", children: viewMenu(c) },
    { type: "sub", label: "Go", children: goMenu(c) },
    { type: "sub", label: "Vault", children: appMenu() },
    ...(mode !== "file"
      ? [
          sep,
          {
            type: "action",
            key: "select-mode",
            label: c.win.selectMode ? "Done Selecting" : "Select",
            onSelect: () => c.win.setSelectMode(!c.win.selectMode),
          } satisfies MenuNode,
        ]
      : []),
  ]
}
