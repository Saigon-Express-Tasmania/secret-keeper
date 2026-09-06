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
          onPaste={() => onPaste?.(pasteDestDir)}
        />
      </ContextMenu>
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
        {sorted.map(({ name, node }, index) => {
          const isDir = node.type === "dir"
          const path = pathFor(name)
          const checked = selected.has(path)
          const iconId = resolveNodeIcon(node, name)
          const isCut = cutPaths.has(path)
          const pasteInto = isDir ? path : pasteDestDir
          const listed = !isDir ? accounts.get(path) : undefined
          const account = accountFromState(listed)
          const loading = listed?.status === "loading"

          return (
            <li key={name}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "grid items-start gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-emerald-50/80",
                      CREDENTIAL_LISTING_GRID,
                      index % 2 === 1 && !checked && "bg-emerald-50/35",
                      checked && "bg-sky-100/70",
                      isCut && "opacity-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 rounded border-input"
                      checked={checked}
                      onChange={() => onToggle(path)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${name}`}
                    />
                    <div className="flex min-w-0 items-start gap-2">
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-emerald-100"
                        title="Change icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          onChangeIcon?.(path, node)
                        }}
                      >
                        <NodeIcon
                          iconId={iconId}
                          kind={isDir ? "folder" : "file"}
                          size={20}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpen(name, node)}
                        className="min-w-0 flex-1 text-left hover:text-emerald-800"
                      >
                        {isDir ? (
                          <div className="truncate font-medium">{name}</div>
                        ) : decryptListing ? (
                          <>
                            <div className="truncate font-medium">
                              {account?.title?.trim() || name}
                            </div>
                            {account?.description?.trim() ? (
                              <div className="line-clamp-2 text-xs text-muted-foreground">
                                {account.description.trim()}
                              </div>
                            ) : null}
                            {account?.title?.trim() &&
                            account.title.trim() !== name ? (
                              <div className="truncate text-xs text-muted-foreground">
                                {name}
                              </div>
                            ) : null}
                            {loading ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="size-3 animate-spin" />
                                Decrypting…
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <div className="truncate font-medium">{name}</div>
                            <div className="text-xs text-muted-foreground">
                              {DECRYPT_LISTING_NOTICE}
                            </div>
                          </>
                        )}
                      </button>
                    </div>

                    <CredentialStackCell
                      account={account}
                      tick={tick}
                      loading={loading}
                      available={!isDir && decryptListing}
                    />

                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {formatNodeDate(node.modifiedAt)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {formatNodeDate(node.createdAt)}
                    </span>
                    <span
                      className={cn(
                        "w-fit truncate rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isDir
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-sky-100 text-sky-800"
                      )}
                    >
                      {nodeTypeLabel(node)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {formatNodeSize(node)}
                    </span>
                  </div>
                </ContextMenuTrigger>
                <ItemContextMenuItems
                  canEdit={!isDir}
                  canPaste={canPaste}
                  onEdit={() => onOpen(name, node)}
                  onCut={() => onCut?.(path)}
                  onCopy={() => onCopy?.(path)}
                  onPaste={() => onPaste?.(pasteInto)}
                  onRename={() => onRename?.(path)}
                  onChangeIcon={() => onChangeIcon?.(path, node)}
                  onDelete={() => onDelete?.(path)}
                />
              </ContextMenu>
            </li>
          )
        })}
      </DetailsTable>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="min-h-24 flex-1" aria-hidden />
        </ContextMenuTrigger>
        <PasteOnlyMenuItems
          canPaste={canPaste}
          onPaste={() => onPaste?.(pasteDestDir)}
        />
      </ContextMenu>
    </div>
  )
}
