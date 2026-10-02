import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
} from "react"
import { useNavigate } from "react-router-dom"

import type { AccountEditorHandle } from "@/components/editor/AccountEditor"
import { useMacAlert, type MacAlertApi } from "@/components/mac/macAlertContext"
import {
  deriveFinderModel,
  type FinderModel,
} from "@/components/dashboard/hooks/finderModel"
import { useFinderMutations, type FinderMutations } from "@/components/dashboard/hooks/useFinderMutations"
import { useFinderPrefs } from "@/components/dashboard/hooks/useFinderPrefs"
import { useLeaveGuard, type LeaveGuard } from "@/components/dashboard/hooks/useLeaveGuard"
import {
  toFileRefs,
  useListedAccounts,
  type ListedAccountState,
} from "@/components/dashboard/useListedAccounts"
import { useVault } from "@/context/VaultContext"
import { useWindowActive } from "@/hooks/useWindowActive"
import { pathExists, untitledName } from "@/lib/finder/paths"
import {
  finderReducer,
  initialFinderState,
  type FinderAction,
  type FinderState,
} from "@/lib/finder/state"
import type { FinderItem, Location } from "@/lib/finder/types"
import type { FinderPrefs } from "@/lib/prefs/finderPrefs"
import {
  readDecryptListingPref,
  writeDecryptListingPref,
} from "@/lib/prefs/decryptListing"
import {
  assertValidName,
  joinPath,
  listRootDirs,
  parentPath,
  pathIsUnderAny,
  type FsFile,
  type VaultArchive,
} from "@/lib/vault/fs"
import { exportFilename } from "@/lib/vault/transfer"

export type NavigateOptions = { select?: string[]; replace?: boolean }

export type FinderController = {
  archive: VaultArchive
  vaultName: string
  state: FinderState
  dispatch: Dispatch<FinderAction>
  model: FinderModel
  prefs: FinderPrefs
  setPrefs: (patch: Partial<FinderPrefs>) => void
  showCredentials: boolean
  setShowCredentials: (on: boolean) => void
  /** Decrypted account summaries for visible files (Show Credentials only). */
  credentials: ReadonlyMap<string, ListedAccountState>
  mutations: FinderMutations
  busy: boolean
  saveError: string | null
  alerts: MacAlertApi
  leave: LeaveGuard
  editor: {
    ref: RefObject<AccountEditorHandle | null>
    dirty: boolean
    setDirty: (dirty: boolean) => void
  }
  win: {
    active: boolean
    minimized: boolean
    setMinimized: (v: boolean) => void
    drawerOpen: boolean
    setDrawerOpen: (v: boolean) => void
    lockPending: boolean
    /** A context menu is open on the content (keeps selection emphasized). */
    menuOpen: boolean
    setMenuOpen: (v: boolean) => void
    selectMode: boolean
    setSelectMode: (v: boolean) => void
  }
  dialogs: {
    iconTarget: FinderItem | null
    setIconTarget: (item: FinderItem | null) => void
    changePasswordOpen: boolean
    setChangePasswordOpen: (v: boolean) => void
    importOpen: boolean
    setImportOpen: (v: boolean) => void
    shortcutsOpen: boolean
    setShortcutsOpen: (v: boolean) => void
    exporting: boolean
  }
  contentRef: RefObject<HTMLDivElement | null>
  searchRef: RefObject<HTMLInputElement | null>
  focusContent: () => void
  /** Navigate (asks to save an edited file first). Resolves false if cancelled. */
  navigate: (location: Location, opts?: NavigateOptions) => Promise<boolean>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  openItem: (item: FinderItem) => Promise<void>
  setQuery: (query: string) => Promise<void>
  startRename: (item: FinderItem) => Promise<void>
  commitRename: (item: FinderItem, name: string) => Promise<boolean>
  startNew: (kind: "folder" | "file") => Promise<void>
  commitNew: (name: string) => Promise<boolean>
  cancelNew: () => void
  setClipboard: (mode: "cut" | "copy", items: FinderItem[]) => void
  paste: (dest: string) => Promise<void>
  moveItems: (paths: string[], dest: string) => Promise<void>
  copyItems: (paths: string[], dest: string) => Promise<void>
  duplicate: (items: FinderItem[]) => Promise<void>
  moveToTrash: (items: FinderItem[]) => Promise<void>
  trashPaths: (paths: string[]) => Promise<void>
  putBack: (items: FinderItem[]) => Promise<void>
  deleteImmediately: (items: FinderItem[]) => Promise<void>
  emptyTrash: () => Promise<void>
  showInfo: (item: FinderItem | null) => void
  requestLock: () => Promise<void>
  exportVault: () => Promise<void>
  importVault: (blob: Uint8Array, password: string) => Promise<void>
  changeMasterPassword: (current: string, next: string) => Promise<void>
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy.buffer], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const INVALID_NAME = "Try using a name with no slashes, or that isn’t just dots."

export function useFinderController(archive: VaultArchive): FinderController {
  const vault = useVault()
  const routerNavigate = useNavigate()
  const alerts = useMacAlert()
  const [prefs, setPrefs] = useFinderPrefs()
  const [state, dispatch] = useReducer(finderReducer, archive, (a) =>
    initialFinderState(listRootDirs(a)[0]?.name ?? "")
  )
  const [showCredentials, setShowCredentialsState] = useState(readDecryptListingPref)
  const editorRef = useRef<AccountEditorHandle | null>(null)
  const [editorDirty, setEditorDirty] = useState(false)
  const leave = useLeaveGuard(editorRef)
  const mutations = useFinderMutations(dispatch, alerts)
  const busy = mutations.busy || vault.saving

  // Leaving an edited file first waits for any save in flight (e.g. ⌘S then
  // Lock), so the user isn't asked to save something that is being saved.
  const busyRef = useRef(busy)
  const idleWaiters = useRef<(() => void)[]>([])
  useEffect(() => {
    busyRef.current = busy
    if (!busy && idleWaiters.current.length > 0) {
      const waiters = idleWaiters.current
      idleWaiters.current = []
      for (const resolve of waiters) resolve()
    }
  }, [busy])
  const confirmLeave = useCallback(async () => {
    if (busyRef.current) {
      await new Promise<void>((resolve) => idleWaiters.current.push(resolve))
    }
    return leave.confirm()
  }, [leave])
  const active = useWindowActive()
  const [minimized, setMinimized] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lockPending, setLockPending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [iconTarget, setIconTarget] = useState<FinderItem | null>(null)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const vaultName = vault.vaultName ?? "Vault"
  const model = useMemo(
    () => deriveFinderModel(archive, state, prefs, vaultName),
    [archive, state, prefs, vaultName]
  )

  // Decrypt only what is on screen (or being previewed), and only when the
  // user turned on Show Credentials. Trash items are never decrypted.
  const visibleFiles = useMemo(() => {
    if (!showCredentials || model.mode === "trash" || model.mode === "file") return []
    const seen = new Set<string>()
    const out: { path: string; node: FsFile }[] = []
    const add = (key: string | null) => {
      const item = key ? model.itemsByKey.get(key) : undefined
      if (!item || item.source !== "vault" || item.node.type !== "file" || seen.has(item.path)) return
      seen.add(item.path)
      out.push({ path: item.path, node: item.node })
    }
    if (model.view !== "columns") for (const item of model.items) add(item.key)
    add(state.selection.focus)
    return toFileRefs(out)
  }, [showCredentials, model, state.selection.focus])
  const credentials = useListedAccounts(showCredentials, visibleFiles)

  // Async flows (await alert / save) must read the latest values.
  const latest = useRef({ archive, state, model })
  useEffect(() => {
    latest.current = { archive, state, model }
  })

  const focusContent = useCallback(() => {
    window.requestAnimationFrame(() => contentRef.current?.focus({ preventScroll: true }))
  }, [])

  const setShowCredentials = useCallback((on: boolean) => {
    setShowCredentialsState(on)
    writeDecryptListingPref(on)
  }, [])

  const navigate = useCallback(
    async (location: Location, opts?: NavigateOptions) => {
      const { model: m } = latest.current
      if (m.mode === "file") {
        const same = location.kind === "path" && location.path === m.path
        if (!same && !(await confirmLeave())) return false
      }
      dispatch({ type: "navigate", location, select: opts?.select, replace: opts?.replace })
      setDrawerOpen(false)
      return true
    },
    [confirmLeave]
  )

  const goBack = useCallback(async () => {
    if (latest.current.model.mode === "file" && !(await confirmLeave())) return
    dispatch({ type: "back" })
  }, [confirmLeave])

  const goForward = useCallback(async () => {
    if (latest.current.model.mode === "file" && !(await confirmLeave())) return
    dispatch({ type: "forward" })
  }, [confirmLeave])

  const openItem = useCallback(
    async (item: FinderItem) => {
      if (item.source === "phantom") return
      if (item.source === "trash") {
        await alerts.alert({
          title: `“${item.name}” is in the Trash.`,
          message: "To use this item, put it back first.",
        })
        return
      }
      await navigate({ kind: "path", path: item.path })
    },
    [alerts, navigate]
  )

  const setQuery = useCallback(
    async (query: string) => {
      const { model: m, state: s } = latest.current
      const starting = !s.search.query.trim() && !!query.trim()
      if (m.mode === "trash") return
      if (m.mode === "file" && starting) {
        const ok = await navigate({ kind: "path", path: m.containerDir }, { select: [m.path] })
        if (!ok) return
        dispatch({ type: "setSearch", query, scope: "vault", scopeDir: m.containerDir })
        return
      }
      if (starting) {
        dispatch({ type: "setSearch", query, scope: "vault", scopeDir: m.containerDir })
        return
      }
      dispatch({ type: "setSearch", query })
    },
    [navigate]
  )

  /** Ask to save first when `paths` contain the open (edited) file. */
  const guardOpenFile = useCallback(
    async (paths: string[]) => {
      const { model: m } = latest.current
      if (m.mode !== "file" || !pathIsUnderAny(m.path, paths)) return true
      return confirmLeave()
    },
    [confirmLeave]
  )

  const validateName = useCallback(
    async (dir: string, name: string, current?: string) => {
      try {
        assertValidName(name)
      } catch {
        await alerts.alert({ title: `The name “${name}” can’t be used.`, message: INVALID_NAME })
        return false
      }
      if (name !== current && pathExists(latest.current.archive, joinPath(dir, name))) {
        await alerts.alert({
          title: `The name “${name}” is already taken.`,
          message: "Please choose a different name.",
        })
        return false
      }
      return true
    },
    [alerts]
  )

  const startRename = useCallback(
    async (item: FinderItem) => {
      if (item.source !== "vault") return
      const { model: m } = latest.current
      if (m.mode === "file") {
        if (!(await confirmLeave())) return
        dispatch({ type: "navigate", location: { kind: "path", path: parentPath(item.path) }, select: [item.key] })
      } else if (!latest.current.state.selection.keys.has(item.key)) {
        dispatch({ type: "setSelection", keys: [item.key] })
      }
      dispatch({ type: "renameStart", key: item.key })
    },
    [confirmLeave]
  )

  const commitRename = useCallback(
    async (item: FinderItem, raw: string) => {
      const name = raw.trim()
      if (!name || name === item.name) {
        dispatch({ type: "renameEnd" })
        return true
      }
      const dir = parentPath(item.path)
      if (!(await validateName(dir, name, item.name))) return false
      if (!(await guardOpenFile([item.path]))) return false
      dispatch({ type: "renameSaving", saving: true })
      const next = await mutations.rename(item.path, name)
      dispatch({ type: "renameSaving", saving: false })
      if (!next) return false
      dispatch({ type: "renameEnd" })
      dispatch({ type: "setSelection", keys: [next] })
      focusContent()
      return true
    },
    [focusContent, guardOpenFile, mutations, validateName]
  )

  const startNew = useCallback(
    async (kind: "folder" | "file") => {
      const { model: m } = latest.current
      if (m.mode !== "folder" && m.mode !== "file") return
      const dir = m.containerDir
      if (m.mode === "file") {
        const ok = await navigate({ kind: "path", path: dir })
        if (!ok) return
      }
      const name = untitledName(latest.current.archive, dir, kind)
      dispatch({ type: "phantomStart", parentDir: dir, kind, name })
    },
    [navigate]
  )

  const commitNew = useCallback(
    async (raw: string) => {
      const phantom = latest.current.state.phantom
      if (!phantom) return true
      let name = raw.trim()
      if (!name) {
        dispatch({ type: "phantomEnd" })
        focusContent()
        return true
      }
      if (phantom.kind === "file" && !name.includes(".")) name = `${name}.json`
      if (!(await validateName(phantom.parentDir, name))) return false
      dispatch({ type: "phantomSaving", saving: true })
      const path =
        phantom.kind === "folder"
          ? await mutations.createFolder(phantom.parentDir, name)
          : await mutations.createAccount(phantom.parentDir, name)
      dispatch({ type: "phantomSaving", saving: false })
      if (!path) return false
      dispatch({ type: "phantomEnd" })
      const { model: m } = latest.current
      if (phantom.kind === "file" && m.mode === "folder" && m.path === phantom.parentDir) {
        dispatch({ type: "navigate", location: { kind: "path", path } })
      } else {
        dispatch({ type: "setSelection", keys: [path] })
        focusContent()
      }
      return true
    },
    [focusContent, mutations, validateName]
  )

  const cancelNew = useCallback(() => {
    dispatch({ type: "phantomEnd" })
    focusContent()
  }, [focusContent])

  const setClipboard = useCallback((mode: "cut" | "copy", items: FinderItem[]) => {
    const paths = items.filter((i) => i.source === "vault").map((i) => i.path)
    if (paths.length > 0) dispatch({ type: "setClipboard", clipboard: { mode, paths } })
  }, [])

  const selectIfHere = useCallback((dest: string, paths: string[] | null) => {
    const { model: m } = latest.current
    if (paths && paths.length > 0 && m.mode === "folder" && m.containerDir === dest) {
      dispatch({ type: "setSelection", keys: paths })
    }
  }, [])

  const moveItems = useCallback(
    async (paths: string[], dest: string) => {
      if (!(await guardOpenFile(paths))) return
      const moved = await mutations.move(paths, dest)
      selectIfHere(dest, moved)
    },
    [guardOpenFile, mutations, selectIfHere]
  )

  const copyItems = useCallback(
    async (paths: string[], dest: string) => {
      const placed = await mutations.copy(paths, dest)
      selectIfHere(dest, placed)
    },
    [mutations, selectIfHere]
  )

  const paste = useCallback(
    async (dest: string) => {
      const clip = latest.current.state.clipboard
      if (!clip) return
      if (clip.mode === "cut") {
        if (!(await guardOpenFile(clip.paths))) return
        const moved = await mutations.move(clip.paths, dest)
        if (moved) dispatch({ type: "setClipboard", clipboard: null })
        selectIfHere(dest, moved)
      } else {
        const placed = await mutations.copy(clip.paths, dest)
        selectIfHere(dest, placed)
      }
    },
    [guardOpenFile, mutations, selectIfHere]
  )

  const duplicate = useCallback(
    async (items: FinderItem[]) => {
      const paths = items.filter((i) => i.source === "vault").map((i) => i.path)
      const placed = await mutations.duplicate(paths)
      if (placed && placed.length > 0 && latest.current.model.mode === "folder") {
        dispatch({ type: "setSelection", keys: placed })
      }
    },
    [mutations]
  )

  const trashPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      if (!(await guardOpenFile(paths))) return
      await mutations.trash(paths)
    },
    [guardOpenFile, mutations]
  )

  const moveToTrash = useCallback(
    (items: FinderItem[]) =>
      trashPaths(items.filter((i) => i.source === "vault").map((i) => i.path)),
    [trashPaths]
  )

  const putBack = useCallback(
    async (items: FinderItem[]) => {
      const ids = items.flatMap((i) => (i.trashId ? [i.trashId] : []))
      const restored = await mutations.putBack(ids)
      if (restored) dispatch({ type: "clearSelection" })
    },
    [mutations]
  )

  const deleteImmediately = useCallback(
    async (items: FinderItem[]) => {
      const ids = items.flatMap((i) => (i.trashId ? [i.trashId] : []))
      if (ids.length === 0) return
      const ok = await alerts.confirm({
        title:
          ids.length === 1
            ? `Are you sure you want to delete “${items[0]!.name}” immediately?`
            : `Are you sure you want to delete these ${ids.length} items immediately?`,
        message: "You can’t undo this action.",
        confirmLabel: "Delete",
        destructive: true,
      })
      if (!ok) return
      if (await mutations.deleteImmediately(ids)) dispatch({ type: "clearSelection" })
    },
    [alerts, mutations]
  )

  const emptyTrash = useCallback(async () => {
    const ok = await alerts.confirm({
      title: "Are you sure you want to permanently erase the items in the Trash?",
      message: "You can’t undo this action.",
      confirmLabel: "Empty Trash",
      destructive: true,
    })
    if (!ok) return
    if (await mutations.emptyTrash()) dispatch({ type: "clearSelection" })
  }, [alerts, mutations])

  const showInfo = useCallback((item: FinderItem | null) => {
    dispatch({ type: "info", key: item ? item.key : "" })
  }, [])

  const { lock } = vault

  const doLock = useCallback(() => {
    lock()
    routerNavigate("/")
  }, [lock, routerNavigate])

  const requestLock = useCallback(async () => {
    if (busyRef.current) setLockPending(true)
    const ok = await confirmLeave()
    setLockPending(false)
    if (ok) doLock()
  }, [confirmLeave, doLock])

  // Warn before closing the tab mid-save or with an edited account.
  const unsaved = busy || editorDirty
  useEffect(() => {
    if (!unsaved) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [unsaved])

  const { exportEncryptedVault, importEncryptedVault } = vault
  const exportVault = useCallback(async () => {
    setExporting(true)
    try {
      downloadBytes(await exportEncryptedVault(), exportFilename())
    } catch (err) {
      await alerts.alert({
        title: "The vault couldn’t be exported.",
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setExporting(false)
    }
  }, [alerts, exportEncryptedVault])

  const importVault = useCallback(
    async (blob: Uint8Array, password: string) => {
      const folderPath = await importEncryptedVault(blob, password)
      await navigate({ kind: "path", path: folderPath })
    },
    [importEncryptedVault, navigate]
  )

  return {
    archive,
    vaultName,
    state,
    dispatch,
    model,
    prefs,
    setPrefs,
    showCredentials,
    setShowCredentials,
    credentials,
    mutations,
    busy,
    saveError: vault.saveError,
    alerts,
    leave,
    editor: { ref: editorRef, dirty: editorDirty, setDirty: setEditorDirty },
    win: {
      active,
      minimized,
      setMinimized,
      drawerOpen,
      setDrawerOpen,
      lockPending,
      menuOpen,
      setMenuOpen,
      selectMode,
      setSelectMode,
    },
    dialogs: {
      iconTarget,
      setIconTarget,
      changePasswordOpen,
      setChangePasswordOpen,
      importOpen,
      setImportOpen,
      shortcutsOpen,
      setShortcutsOpen,
      exporting,
    },
    contentRef,
    searchRef,
    focusContent,
    navigate,
    goBack,
    goForward,
    openItem,
    setQuery,
    startRename,
    commitRename,
    startNew,
    commitNew,
    cancelNew,
    setClipboard,
    paste,
    moveItems,
    copyItems,
    duplicate,
    moveToTrash,
    trashPaths,
    putBack,
    deleteImmediately,
    emptyTrash,
    showInfo,
    requestLock,
    exportVault,
    importVault,
    changeMasterPassword: vault.changeMasterPassword,
  }
}
