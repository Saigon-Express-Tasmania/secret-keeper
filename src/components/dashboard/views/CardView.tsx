import type { ReactNode } from "react"

import {
  OtpCell,
  PasswordCell,
  UsernameCell,
} from "@/components/dashboard/cells/CredentialCells"
import { useFinder } from "@/components/dashboard/finderContext"
import type { ListedAccountState } from "@/components/dashboard/useListedAccounts"
import { EmptyState } from "@/components/dashboard/views/EmptyState"
import { ItemsContextMenu } from "@/components/dashboard/views/ItemsContextMenu"
import { RenameField } from "@/components/dashboard/views/RenameField"
import {
  glyphFor,
  iconKind,
  isCut,
  whereLabel,
} from "@/components/dashboard/views/itemDisplay"
import { domIdFor, useViewSurface } from "@/components/dashboard/views/useViewSurface"
import { FinderIcon } from "@/components/icons/FinderIcon"
import { useElementWidth } from "@/hooks/useElementWidth"
import {
  formatFinderDate,
  formatFinderSize,
  formatItemCount,
} from "@/lib/finder/format"
import { childCount, finderKind, nodeSizeBytes } from "@/lib/finder/items"
import type { FinderItem } from "@/lib/finder/types"
import { cn } from "@/lib/utils"

const CARD_MIN = 272
const GAP = 12
const PAD = 12
const ICON_SIZE = 64

type CardProps = {
  item: FinderItem
  /** Decrypted account (files only; Card view always decrypts). */
  state: ListedAccountState | undefined
  selected: boolean
  emphasized: boolean
  dimmed: boolean
  where: string
  rename: "off" | "editing" | "saving"
  draggable: boolean
  dropTarget: boolean
}

function CredentialRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-6 min-w-0 items-center gap-2 text-[12px] pointer-coarse:h-9">
      <span className="w-9 shrink-0 text-[11px] text-mac-label-2">{label}</span>
      <span className="flex min-w-0 flex-1 items-center text-mac-label">{children}</span>
    </div>
  )
}

function Card({
  item,
  state,
  selected,
  emphasized,
  dimmed,
  where,
  rename,
  draggable,
  dropTarget,
}: CardProps) {
  const c = useFinder()
  const isPhantom = item.source === "phantom"
  const isAccount = item.kind === "file" && !isPhantom
  const account = state?.status === "ready" ? state.account : null
  const title = account?.title.trim() || item.name

  return (
    <div
      role="option"
      id={domIdFor(item.key)}
      aria-selected={selected}
      data-item-key={item.key}
      draggable={draggable}
      className={cn(
        // group/row: the credential cells reveal their buttons on hover/selection.
        "group/row flex min-w-0 flex-col gap-3 rounded-[12px] border border-mac-separator bg-mac-group p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.06)] select-none",
        selected && "border-transparent ring-2",
        selected && (emphasized ? "ring-mac-selection" : "ring-mac-selection-inactive"),
        dropTarget && "border-transparent bg-mac-accent/15 ring-2 ring-mac-accent",
        dimmed && "opacity-50"
      )}
    >
      <div className="flex min-h-16 min-w-0 items-center gap-3">
        <FinderIcon kind={iconKind(item)} glyphId={glyphFor(item)} size={ICON_SIZE} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {rename !== "off" ? (
            <RenameField
              className="w-full"
              initialName={item.name}
              isFile={item.kind === "file"}
              saving={rename === "saving"}
              onCommit={(name) => (isPhantom ? c.commitNew(name) : c.commitRename(item, name))}
              onCancel={() => (isPhantom ? c.cancelNew() : c.dispatch({ type: "renameEnd" }))}
            />
          ) : (
            <p className="truncate text-[15px] leading-5 font-semibold text-mac-label" title={title}>
              {title}
            </p>
          )}
          {account?.description ? (
            <p className="line-clamp-2 text-[12px] leading-4 break-words text-mac-label-2">
              {account.description}
            </p>
          ) : null}
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-mac-label-3">
            <span className="shrink-0 rounded-[4px] bg-black/[0.05] px-1.5 text-[10px] text-mac-label-2 dark:bg-white/[0.08]">
              {finderKind(item.node)}
            </span>
            {rename === "off" && title !== item.name ? (
              <span className="truncate" title={item.name}>
                {item.name}
              </span>
            ) : null}
          </p>
          {where ? <p className="truncate text-[11px] leading-4 text-mac-label-3">in {where}</p> : null}
        </div>
      </div>

      {isAccount ? (
        state?.status === "error" ? (
          <p className="text-[12px] text-mac-red">This item couldn’t be decrypted.</p>
        ) : (
          <div className="rounded-[7px] bg-black/[0.035] px-2 py-0.5 dark:bg-white/[0.05]">
            <CredentialRow label="User">
              <UsernameCell state={state} inverted={false} />
            </CredentialRow>
            <CredentialRow label="Pass">
              <PasswordCell state={state} inverted={false} />
            </CredentialRow>
            <CredentialRow label="OTP">
              <OtpCell state={state} inverted={false} />
            </CredentialRow>
          </div>
        )
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-mac-separator pt-2 text-[11px] text-mac-label-2 tabular-nums">
        <span className="truncate" title="Date Modified">
          {isPhantom ? "--" : formatFinderDate(item.node.modifiedAt)}
        </span>
        <span className="shrink-0">
          {isPhantom
            ? "--"
            : item.kind === "dir"
              ? formatItemCount(childCount(item.node))
              : formatFinderSize(nodeSizeBytes(item.node))}
        </span>
      </div>
    </div>
  )
}

/**
 * Cards with each item's basic details. Account files in the listing are
 * always decrypted here (title, description, username, password, code).
 */
export function CardView() {
  const c = useFinder()
  const { contentRef } = c
  const width = useElementWidth(contentRef)
  const cols = Math.max(1, Math.floor((Math.max(0, width - PAD * 2) + GAP) / (CARD_MIN + GAP)))
  const { emphasized, surfaceProps, dropKey, canDrag } = useViewSurface({ rowLength: cols })
  const { items, mode } = c.model
  const { selection, rename, phantom, clipboard } = c.state

  return (
    <ItemsContextMenu>
      <div
        {...surfaceProps}
        ref={contentRef}
        role="listbox"
        aria-label={c.model.title}
        className={cn(
          "h-full overflow-y-auto overscroll-contain bg-mac-page outline-none",
          dropKey === `bg:${c.model.path}` && "shadow-[inset_0_0_0_2px_var(--mac-accent)]"
        )}
      >
        <EmptyState />
        <div
          className="grid content-start"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(min(${CARD_MIN}px, 100%), 1fr))`,
            gap: GAP,
            padding: PAD,
          }}
        >
          {items.map((item) => {
            const editing =
              item.source === "phantom"
                ? phantom?.saving
                  ? "saving"
                  : "editing"
                : rename?.key === item.key
                  ? rename.saving
                    ? "saving"
                    : "editing"
                  : "off"
            return (
              <Card
                key={item.key}
                item={item}
                state={item.source === "vault" ? c.credentials.get(item.path) : undefined}
                selected={selection.keys.has(item.key)}
                emphasized={emphasized}
                dimmed={c.mutations.pendingKeys.has(item.key) || isCut(clipboard, item)}
                where={mode === "search" ? whereLabel(c, item.where) : ""}
                rename={editing}
                draggable={canDrag && item.source === "vault" && editing === "off"}
                dropTarget={dropKey === item.key}
              />
            )
          })}
        </div>
      </div>
    </ItemsContextMenu>
  )
}
