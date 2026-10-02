import type { ReactNode } from "react"

import { useFinder } from "@/components/dashboard/finderContext"
import { glyphFor, iconKind } from "@/components/dashboard/views/itemDisplay"
import { FinderIcon } from "@/components/icons/FinderIcon"
import { AppIcon } from "@/components/mac/AppIcon"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  formatExactBytes,
  formatFinderDate,
  formatFinderSize,
  formatItemCount,
} from "@/lib/finder/format"
import {
  childCount,
  finderKind,
  nodeSizeBytes,
  safeGetNode,
  trashItems,
  vaultItem,
} from "@/lib/finder/items"
import type { FinderItem } from "@/lib/finder/types"
import { parentPath } from "@/lib/vault/fs"

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-right font-medium text-mac-label-2">{label}:</dt>
      <dd className="min-w-0 break-words text-mac-label">{children}</dd>
    </>
  )
}

/** Finder "Get Info" panel for one item (or the current folder / Trash). */
export function GetInfoDialog() {
  const c = useFinder()
  const key = c.state.infoKey
  const close = () => c.dispatch({ type: "info", key: null })

  let item: FinderItem | null = null
  let trashInfo = false
  if (key === "") {
    if (c.model.mode === "trash") trashInfo = true
    else {
      const node = safeGetNode(c.archive, c.model.containerDir)
      if (node) item = vaultItem(c.model.containerDir, node)
    }
  } else if (key?.startsWith("trash:")) {
    item = trashItems(c.archive).find((t) => t.key === key) ?? null
  } else if (key) {
    const node = safeGetNode(c.archive, key)
    if (node) item = vaultItem(key, node)
  }

  const isRoot = item?.source === "vault" && item.path === ""
  const name = trashInfo ? "Trash" : isRoot ? c.vaultName : (item?.name ?? "")
  const bytes = item ? nodeSizeBytes(item.node) : 0
  const glyph = item && !isRoot ? glyphFor(item) : null
  const canChangeIcon = !!item && item.source === "vault" && !isRoot

  const where = (p: string | undefined) =>
    p === undefined ? "--" : p === "" ? c.vaultName : `${c.vaultName} › ${p.split("/").join(" › ")}`

  return (
    <Dialog open={key !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-4 sm:max-w-[22rem]">
        <div className="flex items-center gap-3">
          {trashInfo || isRoot ? (
            <AppIcon size={48} />
          ) : item ? (
            <button
              type="button"
              disabled={!canChangeIcon}
              title={canChangeIcon ? "Change Icon…" : undefined}
              onClick={() => item && c.dialogs.setIconTarget(item)}
              className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-mac-focus enabled:hover:bg-mac-hover"
            >
              <FinderIcon kind={iconKind(item)} glyphId={glyph} size={48} />
            </button>
          ) : null}
          <div className="min-w-0">
            <DialogTitle className="truncate pr-6">{name} Info</DialogTitle>
            <DialogDescription>
              {trashInfo
                ? formatItemCount(c.archive.recycleBin?.length ?? 0)
                : item
                  ? `${formatFinderSize(bytes)}${item.kind === "dir" ? ` · ${formatItemCount(childCount(item.node))}` : ""}`
                  : ""}
            </DialogDescription>
          </div>
        </div>
        {item ? (
          <section className="rounded-[10px] bg-black/[0.035] p-3 dark:bg-white/[0.05]">
            <h3 className="mb-2 text-[11px] font-semibold text-mac-label-2">General</h3>
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-[12px]">
              <Row label="Kind">{isRoot ? "Vault" : finderKind(item.node)}</Row>
              <Row label="Size">
                {formatExactBytes(bytes)} encrypted
                {item.kind === "dir" ? ` for ${formatItemCount(childCount(item.node))}` : ""}
              </Row>
              {item.source === "trash" ? (
                <>
                  <Row label="Original Location">{where(item.where)}</Row>
                  <Row label="Date Deleted">{formatFinderDate(item.deletedAt, "long")}</Row>
                </>
              ) : !isRoot ? (
                <Row label="Where">{where(parentPath(item.path))}</Row>
              ) : null}
              <Row label="Created">{formatFinderDate(item.node.createdAt, "long")}</Row>
              <Row label="Modified">{formatFinderDate(item.node.modifiedAt, "long")}</Row>
            </dl>
          </section>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canChangeIcon && item ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!glyph || c.busy}
                onClick={() => item && void c.mutations.setIcon(item.path, undefined)}
                className="mr-auto"
              >
                Use Default Icon
              </Button>
              <Button variant="outline" size="sm" disabled={c.busy} onClick={() => c.dialogs.setIconTarget(item)}>
                Change Icon…
              </Button>
            </>
          ) : null}
          <Button size="sm" onClick={close}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
