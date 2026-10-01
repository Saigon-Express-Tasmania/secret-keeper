import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  CREDENTIAL_LISTING_GRID,
  DetailsTable,
  compareDetails,
  fileSizeBytes,
  toggleSort,
  type DetailsSortKey,
  type SortDir,
} from "@/components/dashboard/DetailsTable"
import {
  ItemContextMenuItems,
  PasteOnlyMenuItems,
  type ListingViewControl,
} from "@/components/dashboard/ItemContextMenu"
import {
  CredentialStackCell,
  DECRYPT_LISTING_NOTICE,
} from "@/components/dashboard/ListingCredentialCells"
import {
  toFileRefs,
  useListedAccounts,
  type ListedAccountState,
} from "@/components/dashboard/useListedAccounts"
import { NodeIcon } from "@/components/icons/NodeIcon"
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { AccountEntry } from "@/lib/account/schema"
import type { ListingViewMode } from "@/lib/prefs/listingView"
import {
  formatNodeDate,
  formatNodeSize,
  nodeTypeLabel,
  resolveNodeIcon,
  type FsNode,
} from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

type Entry = { name: string; node: FsNode }

export type ExplorerClipboard = {
  mode: "cut" | "copy"
  paths: string[]
} | null

type ExplorerListingProps = {
  entries: Entry[]
  /** Full path for each entry (parent/name). */
  pathFor: (name: string) => string
  selected: Set<string>
  onToggle: (path: string) => void
  onOpen: (name: string, node: FsNode) => void
  onChangeIcon?: (path: string, node: FsNode) => void
  clipboard?: ExplorerClipboard
  canPaste?: boolean
  onCut?: (path: string) => void
  onCopy?: (path: string) => void
  onPaste?: (destDir: string) => void
  onRename?: (path: string) => void
  onDelete?: (path: string) => void
  /** Directory to paste into when right-clicking empty/background. */
  pasteDestDir?: string
  /** When true, decrypt file bodies for title/creds columns. */
  decryptListing?: boolean
  /** Details table ("list") or cards ("grid"). */
  viewMode?: ListingViewMode
  onViewModeChange?: (mode: ListingViewMode) => void
}

const COLUMNS = [
  { key: "name" as const, label: "Name" },
  { key: "username" as const, label: "Credentials", sortable: false },
  { key: "modified" as const, label: "Date modified" },
  { key: "created" as const, label: "Date created" },
  { key: "type" as const, label: "Type" },
  { key: "size" as const, label: "Size" },
]

function accountFromState(
  state: ListedAccountState | undefined
): AccountEntry | null {
  return state?.status === "ready" ? state.account : null
}

/** Name / decrypted title + description block shared by rows and cards. */
function EntryTitle({
  name,
  isDir,
  decryptListing,
  account,
  loading,
}: {
  name: string
  isDir: boolean
  decryptListing: boolean
  account: AccountEntry | null
  loading: boolean
}) {
  if (isDir) {
    return <div className="truncate font-medium">{name}</div>
  }
  if (!decryptListing) {
    return (
      <>
        <div className="truncate font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">
          {DECRYPT_LISTING_NOTICE}
        </div>
      </>
    )
  }
  return (
    <>
      <div className="truncate font-medium">
        {account?.title?.trim() || name}
      </div>
      {account?.description?.trim() ? (
        <div className="line-clamp-2 text-xs text-muted-foreground">
          {account.description.trim()}
        </div>
      ) : null}
      {account?.title?.trim() && account.title.trim() !== name ? (
        <div className="truncate text-xs text-muted-foreground">{name}</div>
      ) : null}
      {loading ? (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Decrypting…
        </div>
      ) : null}
    </>
  )
}

function TypeBadge({ node }: { node: FsNode }) {
  return (
    <span
      className={cn(
        "w-fit truncate rounded-full px-2 py-0.5 text-[10px] font-semibold",
        node.type === "dir"
          ? "bg-emerald-100 text-emerald-800"
          : "bg-sky-100 text-sky-800"
      )}
    >
      {nodeTypeLabel(node)}
    </span>
  )
}

export function ExplorerListing({
  entries,
  pathFor,
  selected,
  onToggle,
  onOpen,
  onChangeIcon,
  clipboard,
  canPaste = false,
  onCut,
  onCopy,
  onPaste,
  onRename,
  onDelete,
  pasteDestDir = "",
  decryptListing = false,
  viewMode = "list",
  onViewModeChange,
}: ExplorerListingProps) {
  const [sortKey, setSortKey] = useState<DetailsSortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [tick, setTick] = useState(() => Date.now())

  const cutPaths = useMemo(() => {
    if (!clipboard || clipboard.mode !== "cut") return new Set<string>()
    return new Set(clipboard.paths)
  }, [clipboard])

  const fileRefs = useMemo(() => {
    const items: { path: string; node: Extract<FsNode, { type: "file" }> }[] =
      []
    for (const e of entries) {
      if (e.node.type === "file") {
        items.push({ path: pathFor(e.name), node: e.node })
      }
    }
    return toFileRefs(items)
  }, [entries, pathFor])

  const accounts = useListedAccounts(decryptListing, fileRefs)

  const view: ListingViewControl | undefined = useMemo(
    () =>
      onViewModeChange
        ? { mode: viewMode, onChange: onViewModeChange }
        : undefined,
    [viewMode, onViewModeChange]
  )

  useEffect(() => {
    if (!decryptListing || fileRefs.length === 0) return
    const id = window.setInterval(() => setTick(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [decryptListing, fileRefs.length])

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) =>
      compareDetails(
        {
          name: a.name,
          kind: a.node.type === "dir" ? "dir" : "file",
          modified: a.node.modifiedAt,
          created: a.node.createdAt,
          sizeBytes:
            a.node.type === "file"
              ? fileSizeBytes(a.node.ciphertext)
              : Object.keys(a.node.entries).length,
        },
        {
          name: b.name,
          kind: b.node.type === "dir" ? "dir" : "file",
          modified: b.node.modifiedAt,
          created: b.node.createdAt,
          sizeBytes:
            b.node.type === "file"
              ? fileSizeBytes(b.node.ciphertext)
              : Object.keys(b.node.entries).length,
        },
        sortKey === "username" ||
          sortKey === "password" ||
          sortKey === "otp"
          ? "name"
          : sortKey,
        sortDir
      )
    )
  }, [entries, sortKey, sortDir])

  if (entries.length === 0) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-emerald-800/70">
            This folder is empty.
          </div>
        </ContextMenuTrigger>
        <PasteOnlyMenuItems
          canPaste={canPaste}
          view={view}
          onPaste={() => onPaste?.(pasteDestDir)}
        />
      </ContextMenu>
    )
  }

  const items = sorted.map(({ name, node }) => {
    const isDir = node.type === "dir"
    const path = pathFor(name)
    const listed = !isDir ? accounts.get(path) : undefined
    return {
      name,
      node,
      isDir,
      path,
      checked: selected.has(path),
      iconId: resolveNodeIcon(node, name),
      isCut: cutPaths.has(path),
      pasteInto: isDir ? path : pasteDestDir,
      account: accountFromState(listed),
      loading: listed?.status === "loading",
    }
  })

  type Item = (typeof items)[number]

  const renderCheckbox = (item: Item, className: string) => (
    <input
      type="checkbox"
      className={cn("size-4 shrink-0 rounded border-input", className)}
      checked={item.checked}
      onChange={() => onToggle(item.path)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Select ${item.name}`}
    />
  )

  const renderIconButton = (item: Item, size: number) => (
    <button
      type="button"
      className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-emerald-100"
      title="Change icon"
      onClick={(e) => {
        e.stopPropagation()
        onChangeIcon?.(item.path, item.node)
      }}
    >
      <NodeIcon
        iconId={item.iconId}
        kind={item.isDir ? "folder" : "file"}
        size={size}
      />
    </button>
  )

  const renderOpenButton = (item: Item) => (
    <button
      type="button"
      onClick={() => onOpen(item.name, item.node)}
      className="min-w-0 flex-1 text-left hover:text-emerald-800"
    >
      <EntryTitle
        name={item.name}
        isDir={item.isDir}
        decryptListing={decryptListing}
        account={item.account}
        loading={item.loading}
      />
    </button>
  )

  const renderMenu = (item: Item) => (
    <ItemContextMenuItems
      canEdit={!item.isDir}
      canPaste={canPaste}
      view={view}
      onEdit={() => onOpen(item.name, item.node)}
      onCut={() => onCut?.(item.path)}
      onCopy={() => onCopy?.(item.path)}
      onPaste={() => onPaste?.(item.pasteInto)}
      onRename={() => onRename?.(item.path)}
      onChangeIcon={() => onChangeIcon?.(item.path, item.node)}
      onDelete={() => onDelete?.(item.path)}
    />
  )

  const backgroundMenu = (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="min-h-24 flex-1" aria-hidden />
      </ContextMenuTrigger>
      <PasteOnlyMenuItems
        canPaste={canPaste}
        view={view}
        onPaste={() => onPaste?.(pasteDestDir)}
      />
    </ContextMenu>
  )

  if (viewMode === "grid") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 p-3">
          {items.map((item) => (
            <li key={item.name} className="flex">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-emerald-200/70 bg-white/85 p-3 text-sm shadow-sm transition-colors hover:bg-emerald-50/80",
                      item.checked &&
                        "border-sky-300 bg-sky-50 ring-1 ring-sky-300 hover:bg-sky-50",
                      item.isCut && "opacity-50"
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      {renderCheckbox(item, "mt-1.5")}
                      {renderIconButton(item, 28)}
                      {renderOpenButton(item)}
                      <TypeBadge node={item.node} />
                    </div>

                    {!item.isDir && decryptListing ? (
                      <CredentialStackCell
                        account={item.account}
                        tick={tick}
                        loading={item.loading}
                        available
                      />
                    ) : null}

                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-emerald-100 pt-2 text-xs text-muted-foreground tabular-nums">
                      <span className="truncate" title="Date modified">
                        {formatNodeDate(item.node.modifiedAt)}
                      </span>
                      <span className="shrink-0">
                        {formatNodeSize(item.node)}
                      </span>
                    </div>
                  </div>
                </ContextMenuTrigger>
                {renderMenu(item)}
              </ContextMenu>
            </li>
          ))}
        </ul>
        {backgroundMenu}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
      <DetailsTable
        columns={COLUMNS}
        sortKey={sortKey}
        sortDir={sortDir}
        gridClass={CREDENTIAL_LISTING_GRID}
        onSort={(key) => {
          const next = toggleSort(sortKey, sortDir, key)
          setSortKey(next.key)
          setSortDir(next.dir)
        }}
        leadingHeader={<span className="size-4" aria-hidden />}
      >
        {items.map((item, index) => (
          <li key={item.name}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    "grid items-start gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-emerald-50/80",
                    CREDENTIAL_LISTING_GRID,
                    index % 2 === 1 && !item.checked && "bg-emerald-50/35",
                    item.checked && "bg-sky-100/70",
                    item.isCut && "opacity-50"
                  )}
                >
                  {renderCheckbox(item, "mt-1")}
                  <div className="flex min-w-0 items-start gap-2">
                    {renderIconButton(item, 20)}
                    {renderOpenButton(item)}
                  </div>

                  <CredentialStackCell
                    account={item.account}
                    tick={tick}
                    loading={item.loading}
                    available={!item.isDir && decryptListing}
                  />

                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {formatNodeDate(item.node.modifiedAt)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {formatNodeDate(item.node.createdAt)}
                  </span>
                  <TypeBadge node={item.node} />
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {formatNodeSize(item.node)}
                  </span>
                </div>
              </ContextMenuTrigger>
              {renderMenu(item)}
            </ContextMenu>
          </li>
        ))}
      </DetailsTable>
      {backgroundMenu}
    </div>
  )
}
