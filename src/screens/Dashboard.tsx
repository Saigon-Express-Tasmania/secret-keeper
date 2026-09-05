import { useMemo, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import {
  FilePlus,
  FolderPlus,
  LockKeyhole,
  RotateCcw,
  Search,
} from "lucide-react"

import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog"
import {
  CreateNodeDialog,
  type CreateNodeResult,
} from "@/components/dashboard/CreateNodeDialog"
import { ExplorerListing } from "@/components/dashboard/ExplorerListing"
import { FileViewer } from "@/components/dashboard/FileViewer"
import { FolderSidebar } from "@/components/dashboard/FolderSidebar"
import { IconPickerDialog } from "@/components/dashboard/IconPickerDialog"
import { RecycleBinListing } from "@/components/dashboard/RecycleBinListing"
import { SearchResults } from "@/components/dashboard/SearchResults"
import { SelectionToolbar } from "@/components/dashboard/SelectionToolbar"
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
  assertValidName,
  getNode,
  joinPath,
  listDir,
  listRootDirs,
  mkdir,
  parentPath,
  searchArchive,
  setNodeIcon,
  splitPath,
  type FsNode,
} from "@/lib/vault/fs"
import {
  listRecycleBin,
  moveToRecycleBin,
  pathIsUnderAny,
  purgeRecycleBin,
  restoreFromRecycleBin,
} from "@/lib/vault/recycleBin"

export function Dashboard() {
  const {
    unlocked,
    payload,
    lock,
    saving,
    saveError,
    commit,
    putEncryptedFile,
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

  const createParent =
    currentNode?.type === "file" ? parentPath(resolvedPath) : resolvedPath

  function handleLock() {
    lock()
    navigate("/")
  }

  function navigateTo(path: string) {
    setViewMode("explorer")
    setCurrentPath(path)
    setSearchQuery("")
  }

  function openRecycleBin() {
    setViewMode("recycle-bin")
    setSearchQuery("")
    setSelected(new Set())
  }

  function openChild(name: string, _node: FsNode) {
    navigateTo(joinPath(resolvedPath, name))
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
    await putEncryptedFile(path, {}, { icon })
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
    <div className="flex h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList>
            <BreadcrumbItem>
              {inBin || segments.length === 0 ? (
                inBin ? (
                  <BreadcrumbLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      navigateTo(rootFolders[0]?.name ?? "")
                    }}
                  >
                    Vault
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>Vault</BreadcrumbPage>
                )
              ) : (
                <BreadcrumbLink
                  href="#"
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
                  <BreadcrumbPage>Recycle Bin</BreadcrumbPage>
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
                        <BreadcrumbPage className="max-w-[12rem] truncate">
                          {seg}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          href="#"
                          className="max-w-[10rem] truncate"
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
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or folder…"
              className="pl-8"
              aria-label="Search files and folders"
            />
          </div>
        ) : null}

        {showCreate ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateKind("folder")}
              disabled={saving}
            >
              <FolderPlus />
              <span className="hidden sm:inline">New folder</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateKind("file")}
              disabled={saving}
            >
              <FilePlus />
              <span className="hidden sm:inline">New file</span>
            </Button>
          </>
        ) : null}
        <Button variant="outline" size="sm" onClick={handleLock}>
          <LockKeyhole />
          Lock
        </Button>
      </header>

      {saveError ? (
        <div
          className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          {saveError}
        </div>
      ) : null}

      {saving ? (
        <div className="border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
          Saving vault…
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <FolderSidebar
          folders={rootFolders}
          activeRoot={activeRoot}
          view={viewMode === "recycle-bin" ? "recycle-bin" : "folder"}
          recycleBinCount={recycleBinEntries.length}
          onSelectFolder={(name) => navigateTo(name)}
          onSelectRecycleBin={openRecycleBin}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
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
                />
              </div>
            </>
          ) : currentNode?.type === "file" ? (
            <FileViewer key={resolvedPath} path={resolvedPath} />
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
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
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
      <ConfirmDialog
        open={confirmPurge}
        onOpenChange={setConfirmPurge}
        title="Delete forever?"
        description={`Permanently delete ${selected.size} item${selected.size === 1 ? "" : "s"} from the Recycle Bin. This cannot be undone.`}
        confirmLabel="Delete forever"
        busy={saving}
        onConfirm={handlePurge}
      />
    </div>
  )
}
