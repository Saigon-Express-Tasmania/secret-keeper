import { useMemo, useRef, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import {
  FilePlus,
  FolderPlus,
  LockKeyhole,
  RotateCcw,
  Search,
} from "lucide-react"

import { AppBackdrop } from "@/components/AppBackdrop"
import { ChangeMasterPasswordDialog } from "@/components/dashboard/ChangeMasterPasswordDialog"
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog"
import {
  CreateNodeDialog,
  type CreateNodeResult,
} from "@/components/dashboard/CreateNodeDialog"
import {
  ExplorerListing,
  type ExplorerClipboard,
} from "@/components/dashboard/ExplorerListing"
import { FileViewer } from "@/components/dashboard/FileViewer"
import { FolderSidebar } from "@/components/dashboard/FolderSidebar"
import { IconPickerDialog } from "@/components/dashboard/IconPickerDialog"
import { ImportVaultDialog } from "@/components/dashboard/ImportVaultDialog"
import { RecycleBinListing } from "@/components/dashboard/RecycleBinListing"
import { RenameDialog } from "@/components/dashboard/RenameDialog"
import { SearchResults } from "@/components/dashboard/SearchResults"
import { SelectionToolbar } from "@/components/dashboard/SelectionToolbar"
import { ToolsMenu } from "@/components/dashboard/ToolsMenu"
import { UnsavedChangesDialog } from "@/components/dashboard/UnsavedChangesDialog"
import type { AccountEditorHandle } from "@/components/editor/AccountEditor"
import {
  createEmptyAccount,
  serializeAccount,
} from "@/lib/account/schema"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useVault } from "@/context/VaultContext"
import {
  readDecryptListingPref,
  writeDecryptListingPref,
} from "@/lib/prefs/decryptListing"
import {
  assertValidName,
  copyNodes,
  getNode,
  joinPath,
  listDir,
  listRootDirs,
  mkdir,
  moveNodes,
  parentPath,
  pathBasename,
  pathIsUnderAny,
  pruneDescendantPaths,
  renameNode,
  searchArchive,
  setNodeIcon,
  splitPath,
  type FsNode,
} from "@/lib/vault/fs"
import {
  listRecycleBin,
  moveToRecycleBin,
  purgeRecycleBin,
  restoreFromRecycleBin,
} from "@/lib/vault/recycleBin"
import { exportFilename } from "@/lib/vault/transfer"

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

export function Dashboard() {
  const {
    unlocked,
    payload,
    lock,
    saving,
    saveError,
    commit,
    putEncryptedFile,
    changeMasterPassword,
    exportEncryptedVault,
    importEncryptedVault,
  } = useVault()
  const navigate = useNavigate()

  const rootFolders = useMemo(
    () => (payload ? listRootDirs(payload) : []),
    [payload]
  )

  const recycleBinEntries = useMemo(
    () => (payload ? listRecycleBin(payload) : []),
    [payload]
  )

  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [createKind, setCreateKind] = useState<"folder" | "file" | null>(null)
  const [viewMode, setViewMode] = useState<"explorer" | "recycle-bin">(
    "explorer"
  )
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [selectionScope, setSelectionScope] = useState("")
  const [iconEdit, setIconEdit] = useState<{
    path: string
    kind: "folder" | "file"
    icon?: string
  } | null>(null)
  const [clipboard, setClipboard] = useState<ExplorerClipboard>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [leavePending, setLeavePending] = useState<(() => void) | null>(null)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [decryptListing, setDecryptListing] = useState(readDecryptListingPref)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const editorRef = useRef<AccountEditorHandle | null>(null)

  const resolvedPath = currentPath ?? rootFolders[0]?.name ?? ""
  const scopeKey = `${viewMode}:${resolvedPath}:${searchQuery}`
  if (scopeKey !== selectionScope) {
    setSelectionScope(scopeKey)
    setSelected(new Set())
  }

  if (!unlocked || !payload) {
    return <Navigate to="/" replace />
  }

  const segments = splitPath(resolvedPath)
  const activeRoot = segments[0] ?? null
  const currentNode =
    viewMode === "explorer" ? getNode(payload, resolvedPath) : null
  const isSearching = viewMode === "explorer" && searchQuery.trim().length > 0
  const searchHits = isSearching
    ? searchArchive(payload, searchQuery)
    : []
  const fileOpen =
    viewMode === "explorer" &&
    !isSearching &&
    currentNode?.type === "file"

  const createParent =
    currentNode?.type === "file" ? parentPath(resolvedPath) : resolvedPath

  /** Run `action` after confirming save/discard if the account editor is dirty. */
  function requestLeave(action: () => void) {
    if (fileOpen && editorRef.current?.isDirty()) {
      setLeavePending(() => action)
      return
    }
    action()
  }

  function applyNavigate(path: string) {
    setViewMode("explorer")
    setCurrentPath(path)
    setSearchQuery("")
  }

  function handleLock() {
    requestLeave(() => {
      lock()
      navigate("/")
    })
  }

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportEncryptedVault()
      downloadBytes(blob, exportFilename())
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to export vault."
      window.alert(message)
    } finally {
      setExporting(false)
    }
  }

  async function handleImport(blob: Uint8Array, password: string) {
    const folderPath = await importEncryptedVault(blob, password)
    navigateTo(folderPath)
  }

  function navigateTo(path: string) {
    requestLeave(() => applyNavigate(path))
  }

  function openRecycleBin() {
    requestLeave(() => {
      setViewMode("recycle-bin")
      setSearchQuery("")
      setSelected(new Set())
    })
  }

  function openChild(name: string, _node: FsNode) {
    navigateTo(joinPath(resolvedPath, name))
  }

  function setSearchQueryGuarded(value: string) {
    const wasSearching = searchQuery.trim().length > 0
    const willSearch = value.trim().length > 0
    if (fileOpen && !wasSearching && willSearch) {
      requestLeave(() => setSearchQuery(value))
      return
    }
    setSearchQuery(value)
  }

  async function confirmLeaveSave() {
    if (!leavePending) return
    setLeaveBusy(true)
    try {
      const ok = (await editorRef.current?.save()) ?? false
      if (ok) {
        const action = leavePending
        setLeavePending(null)
        action()
      }
    } finally {
      setLeaveBusy(false)
    }
  }

  function confirmLeaveDiscard() {
    if (!leavePending) return
    editorRef.current?.discard()
    const action = leavePending
    setLeavePending(null)
    action()
  }

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function ensureUnique(name: string) {
    const existing = getNode(payload!, joinPath(createParent, name))
    if (existing) {
      throw new Error(`“${name}” already exists here.`)
    }
  }

  function openIconEditor(path: string, node?: FsNode | null) {
    const n = node ?? getNode(payload!, path)
    if (!n) return
    setIconEdit({
      path,
      kind: n.type === "dir" ? "folder" : "file",
      icon: n.icon,
    })
  }

  async function applyIcon(iconId: string) {
    if (!iconEdit) return
    const path = iconEdit.path
    await commit((archive) => {
      setNodeIcon(archive, path, iconId)
    })
    setIconEdit(null)
  }

  /** Paths for cut/copy: whole selection if target is selected, else just target. */
  function clipboardPathsFor(path: string): string[] {
    if (selected.has(path) && selected.size > 0) {
      return pruneDescendantPaths([...selected])
    }
    return [path]
  }

  function handleCut(path: string) {
    setClipboard({ mode: "cut", paths: clipboardPathsFor(path) })
  }

  function handleCopy(path: string) {
    setClipboard({ mode: "copy", paths: clipboardPathsFor(path) })
  }

  async function handlePaste(destDir: string) {
    if (!clipboard || clipboard.paths.length === 0) return
    const { mode, paths } = clipboard
    const wasUnder =
      mode === "cut" && pathIsUnderAny(resolvedPath, paths)
    const fallback = parentPath(paths[0]!)

    await commit((archive) => {
      if (mode === "cut") {
        moveNodes(archive, paths, destDir)
      } else {
        copyNodes(archive, paths, destDir)
      }
    })

    if (mode === "cut") {
      setClipboard(null)
      setSelected(new Set())
      if (wasUnder) {
        navigateTo(fallback)
      }
    }
  }

  function openRename(path: string) {
    setRenameTarget(path)
  }

  async function applyRename(newName: string) {
    if (!renameTarget) return
    const oldPath = renameTarget
    let newPath = oldPath
    await commit((archive) => {
      newPath = renameNode(archive, oldPath, newName)
    })
    setRenameTarget(null)
    setSelected((prev) => {
      if (!prev.has(oldPath)) return prev
      const next = new Set(prev)
      next.delete(oldPath)
      next.add(newPath)
      return next
    })
    setClipboard((prev) => {
      if (!prev) return prev
      const paths = prev.paths.map((p) =>
        p === oldPath
          ? newPath
          : p.startsWith(`${oldPath}/`)
            ? `${newPath}${p.slice(oldPath.length)}`
            : p
      )
      return { ...prev, paths }
    })
    if (
      resolvedPath === oldPath ||
      resolvedPath.startsWith(`${oldPath}/`)
    ) {
      navigateTo(
        resolvedPath === oldPath
          ? newPath
          : `${newPath}${resolvedPath.slice(oldPath.length)}`
      )
    }
  }

  async function createFolder({ name, icon }: CreateNodeResult) {
    assertValidName(name)
    ensureUnique(name)
    const path = joinPath(createParent, name)
    await commit((archive) => {
      mkdir(archive, path, { icon })
    })
    navigateTo(path)
  }

  async function createFile({ name: rawName, icon }: CreateNodeResult) {
    let name = rawName.trim()
    if (!name.includes(".")) {
      name = `${name}.json`
    }
    assertValidName(name)
    ensureUnique(name)
    const path = joinPath(createParent, name)
    await putEncryptedFile(path, serializeAccount(createEmptyAccount()), {
      icon,
    })
    navigateTo(path)
  }

  async function handleSoftDelete() {
    const paths = [...selected]
    if (paths.length === 0) return
    const wasUnder = pathIsUnderAny(resolvedPath, paths)
    const fallback = parentPath(paths[0]!)
    await commit((archive) => {
      moveToRecycleBin(archive, paths)
    })
    setSelected(new Set())
    setClipboard((prev) => {
      if (!prev) return prev
      const remaining = prev.paths.filter(
        (p) => !paths.some((d) => p === d || p.startsWith(`${d}/`))
      )
      return remaining.length === 0 ? null : { ...prev, paths: remaining }
    })
    if (wasUnder) {
      navigateTo(fallback)
    }
  }

  async function handleRestore() {
    const ids = [...selected]
    if (ids.length === 0) return
    await commit((archive) => {
      restoreFromRecycleBin(archive, ids)
    })
    setSelected(new Set())
  }

  async function handlePurge() {
    const ids = [...selected]
    if (ids.length === 0) return
    await commit((archive) => {
      purgeRecycleBin(archive, ids)
    })
    setSelected(new Set())
  }

  const inBin = viewMode === "recycle-bin"
  const showCreate = !inBin && !isSearching

  return (
    <div className="relative flex h-svh flex-col overflow-hidden">
      <AppBackdrop blurred />
      <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-emerald-200/70 bg-gradient-to-r from-emerald-50/90 via-white/70 to-sky-50/80 px-3 shadow-sm shadow-emerald-900/5 backdrop-blur-md">
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1 text-white shadow-sm shadow-emerald-700/30">
          <LockKeyhole className="size-3.5" />
          <span className="hidden text-xs font-semibold tracking-wide sm:inline">
            Keep
          </span>
        </div>
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="text-emerald-700/80">
            <BreadcrumbItem>
              {inBin || segments.length === 0 ? (
                inBin ? (
                  <BreadcrumbLink
                    href="#"
                    className="text-emerald-700 hover:text-emerald-900"
                    onClick={(e) => {
                      e.preventDefault()
                      navigateTo(rootFolders[0]?.name ?? "")
                    }}
                  >
                    Vault
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="font-semibold text-emerald-800">
                    Vault
                  </BreadcrumbPage>
                )
              ) : (
                <BreadcrumbLink
                  href="#"
                  className="text-emerald-700 hover:text-emerald-900"
                  onClick={(e) => {
                    e.preventDefault()
                    navigateTo("")
                  }}
                >
                  Vault
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {inBin ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold text-rose-800">
                    Recycle Bin
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              segments.map((seg, i) => {
                const path = segments.slice(0, i + 1).join("/")
                const isLast = i === segments.length - 1
                return (
                  <span key={path} className="contents">
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage className="max-w-[12rem] truncate font-semibold text-emerald-800">
                          {seg}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          href="#"
                          className="max-w-[10rem] truncate text-emerald-700 hover:text-emerald-900"
                          onClick={(e) => {
                            e.preventDefault()
                            navigateTo(path)
                          }}
                        >
                          {seg}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </span>
                )
              })
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {!inBin ? (
          <div className="relative w-48 sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-emerald-600" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQueryGuarded(e.target.value)}
              placeholder="Search name or folder…"
              className="border-emerald-200/80 bg-white/80 pl-8 focus-visible:ring-emerald-400"
              aria-label="Search files and folders"
            />
          </div>
        ) : null}

        {!inBin ? (
          <label
            htmlFor="decrypt-listing"
            className="flex cursor-pointer items-center gap-2 text-sm text-emerald-800"
          >
            <input
              id="decrypt-listing"
              type="checkbox"
              className="size-4 rounded border-emerald-300 accent-emerald-600"
              checked={decryptListing}
              onChange={(e) => {
                const next = e.target.checked
                setDecryptListing(next)
                writeDecryptListingPref(next)
              }}
            />
            <span className="hidden whitespace-nowrap sm:inline">
              Decrypt listing
            </span>
            <span className="sm:hidden">Decrypt</span>
          </label>
        ) : null}

        {showCreate ? (
          <>
            <Button
              size="sm"
              onClick={() => setCreateKind("folder")}
              disabled={saving}
              className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
            >
              <FolderPlus />
              <span className="hidden sm:inline">New folder</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateKind("file")}
              disabled={saving}
              className="bg-sky-600 text-white shadow-sm hover:bg-sky-700"
            >
              <FilePlus />
              <span className="hidden sm:inline">New file</span>
            </Button>
          </>
        ) : null}
        <ToolsMenu
          disabled={saving}
          exporting={exporting}
          onExport={() => void handleExport()}
          onImport={() => setImportOpen(true)}
          onChangePassword={() => setChangePasswordOpen(true)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleLock}
          className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
        >
          <LockKeyhole />
          Lock
        </Button>
      </header>

      {saveError ? (
        <div
          className="relative z-10 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          {saveError}
        </div>
      ) : null}

      {saving ? (
        <div className="relative z-10 border-b border-sky-200 bg-sky-50 px-4 py-1.5 text-xs text-sky-800">
          Saving vault…
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-0 flex-1">
        <FolderSidebar
          folders={rootFolders}
          activeRoot={activeRoot}
          view={viewMode === "recycle-bin" ? "recycle-bin" : "folder"}
          recycleBinCount={recycleBinEntries.length}
          onSelectFolder={(name) => navigateTo(name)}
          onSelectRecycleBin={openRecycleBin}
          clipboard={clipboard}
          canPaste={clipboard !== null && clipboard.paths.length > 0}
          onCut={handleCut}
          onCopy={handleCopy}
          onPaste={(dest) => void handlePaste(dest)}
          onRename={openRename}
          onChangeIcon={(path) => openIconEditor(path)}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white/55">
          {inBin ? (
            <>
              <SelectionToolbar
                count={selected.size}
                busy={saving}
                onDelete={() => setConfirmPurge(true)}
                deleteLabel="Delete forever"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRestore()}
                  disabled={saving || selected.size === 0}
                  className="border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                >
                  <RotateCcw />
                  Restore
                </Button>
              </SelectionToolbar>
              <div className="min-h-0 flex-1 overflow-auto">
                <RecycleBinListing
                  entries={recycleBinEntries}
                  selected={selected}
                  onToggle={toggleSelected}
                />
              </div>
            </>
          ) : isSearching ? (
            <>
              <SelectionToolbar
                count={selected.size}
                busy={saving}
                onDelete={() => void handleSoftDelete()}
              />
              <div className="min-h-0 flex-1 overflow-auto">
                <SearchResults
                  archive={payload}
                  hits={searchHits}
                  query={searchQuery.trim()}
                  selected={selected}
                  onToggle={toggleSelected}
                  onOpen={navigateTo}
                  onChangeIcon={(path) => openIconEditor(path)}
                  clipboard={clipboard}
                  canPaste={clipboard !== null && clipboard.paths.length > 0}
                  onCut={handleCut}
                  onCopy={handleCopy}
                  onPaste={(dest) => void handlePaste(dest)}
                  onRename={openRename}
                  decryptListing={decryptListing}
                />
              </div>
            </>
          ) : currentNode?.type === "file" ? (
            <FileViewer
              key={resolvedPath}
              path={resolvedPath}
              editorRef={editorRef}
            />
          ) : currentNode?.type === "dir" ? (
            <>
              <SelectionToolbar
                count={selected.size}
                busy={saving}
                onDelete={() => void handleSoftDelete()}
              />
              <div className="min-h-0 flex-1 overflow-auto">
                <ExplorerListing
                  entries={listDir(payload, resolvedPath)}
                  pathFor={(name) => joinPath(resolvedPath, name)}
                  selected={selected}
                  onToggle={toggleSelected}
                  onOpen={openChild}
                  onChangeIcon={(path, node) => openIconEditor(path, node)}
                  clipboard={clipboard}
                  canPaste={clipboard !== null && clipboard.paths.length > 0}
                  onCut={handleCut}
                  onCopy={handleCopy}
                  onPaste={(dest) => void handlePaste(dest)}
                  onRename={openRename}
                  pasteDestDir={resolvedPath}
                  decryptListing={decryptListing}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-emerald-800/70">
              Path not found.
            </div>
          )}
        </main>
      </div>

      <CreateNodeDialog
        open={createKind === "folder"}
        onOpenChange={(open) => {
          if (!open) setCreateKind(null)
        }}
        kind="folder"
        busy={saving}
        onSubmit={createFolder}
      />
      <CreateNodeDialog
        open={createKind === "file"}
        onOpenChange={(open) => {
          if (!open) setCreateKind(null)
        }}
        kind="file"
        busy={saving}
        onSubmit={createFile}
      />
      <IconPickerDialog
        open={iconEdit !== null}
        onOpenChange={(open) => {
          if (!open) setIconEdit(null)
        }}
        value={iconEdit?.icon}
        kind={iconEdit?.kind}
        onSelect={(id) => void applyIcon(id)}
        title="Change icon"
      />
      <RenameDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
        currentName={renameTarget ? pathBasename(renameTarget) : ""}
        busy={saving}
        onSubmit={applyRename}
      />
      <ConfirmDialog
        open={confirmPurge}
        onOpenChange={setConfirmPurge}
        title="Delete forever?"
        description={`Permanently delete ${selected.size} item${selected.size === 1 ? "" : "s"} from the Recycle Bin. This cannot be undone.`}
        confirmLabel="Delete forever"
        busy={saving}
        onConfirm={handlePurge}
      />
      <UnsavedChangesDialog
        open={leavePending !== null}
        busy={leaveBusy || saving}
        onSave={() => void confirmLeaveSave()}
        onDiscard={confirmLeaveDiscard}
        onCancel={() => setLeavePending(null)}
      />
      <ChangeMasterPasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
        busy={saving}
        onSubmit={changeMasterPassword}
      />
      <ImportVaultDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        busy={saving}
        onSubmit={handleImport}
      />
    </div>
  )
}
