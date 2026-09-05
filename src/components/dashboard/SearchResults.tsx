import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  CREDENTIAL_SEARCH_GRID,
  DetailsTable,
  compareDetails,
  fileSizeBytes,
  toggleSort,
  type DetailsSortKey,
  type SortDir,
} from "@/components/dashboard/DetailsTable"
import type { ExplorerClipboard } from "@/components/dashboard/ExplorerListing"
import { ItemContextMenuItems } from "@/components/dashboard/ItemContextMenu"
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
  getNode,
  nodeTypeLabel,
  parentPath,
  resolveNodeIcon,
  type FsFile,
  type SearchHit,
  type VaultArchive,
} from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

type SearchResultsProps = {
  archive: VaultArchive
  hits: SearchHit[]
  query: string
  selected: Set<string>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onChangeIcon?: (path: string) => void
  clipboard?: ExplorerClipboard
  canPaste?: boolean
  onCut?: (path: string) => void
  onCopy?: (path: string) => void
  onPaste?: (destDir: string) => void
  onRename?: (path: string) => void
  decryptListing?: boolean
}

const COLUMNS = [
  { key: "name" as const, label: "Name" },
  { key: "username" as const, label: "Credentials", sortable: false },
  { key: "modified" as const, label: "Date modified" },
  { key: "type" as const, label: "Type" },
  { key: "size" as const, label: "Size" },
]

function accountFromState(
  state: ListedAccountState | undefined
): AccountEntry | null {
  return state?.status === "ready" ? state.account : null
}

export function SearchResults({
  archive,
  hits,
  query,
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
  decryptListing = false,
}: SearchResultsProps) {
  const [sortKey, setSortKey] = useState<DetailsSortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [tick, setTick] = useState(() => Date.now())

  const cutPaths = useMemo(() => {
    if (!clipboard || clipboard.mode !== "cut") return new Set<string>()
    return new Set(clipboard.paths)
  }, [clipboard])

  const fileRefs = useMemo(() => {
    const items: { path: string; node: FsFile }[] = []
    for (const hit of hits) {
      if (hit.kind !== "file") continue
      const node = getNode(archive, hit.path)
      if (node?.type === "file") {
        items.push({ path: hit.path, node })
      }
    }
    return toFileRefs(items)
  }, [hits, archive])

  const accounts = useListedAccounts(decryptListing, fileRefs)

  useEffect(() => {
    if (!decryptListing || fileRefs.length === 0) return
    const id = window.setInterval(() => setTick(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [decryptListing, fileRefs.length])

  const sorted = useMemo(() => {
    return [...hits].sort((a, b) => {
      const nodeA = getNode(archive, a.path)
      const nodeB = getNode(archive, b.path)
      const key =
        sortKey === "username" ||
        sortKey === "password" ||
        sortKey === "otp"
          ? "name"
          : sortKey
      return compareDetails(
        {
          name: a.name,
          kind: a.kind,
          modified: nodeA?.modifiedAt,
          created: nodeA?.createdAt,
          sizeBytes:
            nodeA?.type === "file"
              ? fileSizeBytes(nodeA.ciphertext)
              : nodeA?.type === "dir"
                ? Object.keys(nodeA.entries).length
                : 0,
        },
        {
          name: b.name,
          kind: b.kind,
          modified: nodeB?.modifiedAt,
          created: nodeB?.createdAt,
          sizeBytes:
            nodeB?.type === "file"
              ? fileSizeBytes(nodeB.ciphertext)
              : nodeB?.type === "dir"
                ? Object.keys(nodeB.entries).length
                : 0,
        },
        key,
        sortDir
      )
    })
  }, [hits, archive, sortKey, sortDir])

  if (hits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-emerald-800/70">
        No matches for “{query}”.
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
      <DetailsTable
        columns={COLUMNS}
        sortKey={sortKey}
        sortDir={sortDir}
        gridClass={CREDENTIAL_SEARCH_GRID}
        onSort={(key) => {
          const next = toggleSort(sortKey, sortDir, key)
          setSortKey(next.key)
          setSortDir(next.dir)
        }}
        leadingHeader={<span className="size-4" aria-hidden />}
      >
        {sorted.map((hit, index) => {
          const checked = selected.has(hit.path)
          const node = getNode(archive, hit.path)
          const iconId = node
            ? resolveNodeIcon(node, hit.name)
            : undefined
          const isCut = cutPaths.has(hit.path)
          const isDir = hit.kind === "dir"
          const pasteInto = isDir ? hit.path : parentPath(hit.path)
          const listed = !isDir ? accounts.get(hit.path) : undefined
          const account = accountFromState(listed)
          const loading = listed?.status === "loading"

          return (
            <li key={hit.path}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "grid items-start gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-emerald-50/80",
                      CREDENTIAL_SEARCH_GRID,
                      index % 2 === 1 && !checked && "bg-emerald-50/35",
                      checked && "bg-sky-100/70",
                      isCut && "opacity-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 rounded border-input"
                      checked={checked}
                      onChange={() => onToggle(hit.path)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${hit.name}`}
                    />
                    <div className="flex min-w-0 items-start gap-2">
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-emerald-100"
                        title="Change icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          onChangeIcon?.(hit.path)
                        }}
                      >
                        <NodeIcon
                          iconId={iconId}
                          kind={hit.kind === "dir" ? "folder" : "file"}
                          size={20}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpen(hit.path)}
                        className="min-w-0 flex-1 text-left hover:text-emerald-800"
                      >
                        {isDir ? (
                          <>
                            <div className="truncate font-medium">
                              {hit.name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {hit.path}
                            </div>
                          </>
                        ) : decryptListing ? (
                          <>
                            <div className="truncate font-medium">
                              {account?.title?.trim() || hit.name}
                            </div>
                            {account?.description?.trim() ? (
                              <div className="line-clamp-2 text-xs text-muted-foreground">
                                {account.description.trim()}
                              </div>
                            ) : null}
                            <div className="truncate text-xs text-muted-foreground">
                              {hit.path}
                            </div>
                            {loading ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="size-3 animate-spin" />
                                Decrypting…
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <div className="truncate font-medium">
                              {hit.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {DECRYPT_LISTING_NOTICE}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {hit.path}
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
                      {formatNodeDate(node?.modifiedAt)}
                    </span>
                    <span
                      className={cn(
                        "w-fit truncate rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isDir
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-sky-100 text-sky-800"
                      )}
                    >
                      {node
                        ? nodeTypeLabel(node)
                        : hit.kind === "dir"
                          ? "Folder"
                          : "JSON"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {node ? formatNodeSize(node) : "—"}
                    </span>
                  </div>
                </ContextMenuTrigger>
                <ItemContextMenuItems
                  canEdit={!isDir}
                  canPaste={canPaste}
                  onEdit={() => onOpen(hit.path)}
                  onCut={() => onCut?.(hit.path)}
                  onCopy={() => onCopy?.(hit.path)}
                  onPaste={() => onPaste?.(pasteInto)}
                  onRename={() => onRename?.(hit.path)}
                  onChangeIcon={() => onChangeIcon?.(hit.path)}
                />
              </ContextMenu>
            </li>
          )
        })}
      </DetailsTable>
    </div>
  )
}
