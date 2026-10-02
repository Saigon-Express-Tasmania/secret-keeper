import { useFinder } from "@/components/dashboard/finderContext"
import { ItemsContextMenu } from "@/components/dashboard/views/ItemsContextMenu"
import { RenameField } from "@/components/dashboard/views/RenameField"
import {
  glyphFor,
  iconKind,
  infoText,
  isCut,
} from "@/components/dashboard/views/itemDisplay"
import { domIdFor, useViewSurface } from "@/components/dashboard/views/useViewSurface"
import { FinderIcon } from "@/components/icons/FinderIcon"
import { useElementWidth } from "@/hooks/useElementWidth"
import type { FinderItem } from "@/lib/finder/types"
import { cn } from "@/lib/utils"

const GAP = 4
const PAD = 12

type CellProps = {
  item: FinderItem
  size: number
  selected: boolean
  emphasized: boolean
  dimmed: boolean
  info: string | null
  rename: "off" | "editing" | "saving"
}

function IconCell({
  item,
  size,
  selected,
  emphasized,
  dimmed,
  info,
  rename,
}: CellProps) {
  const c = useFinder()
  const isPhantom = item.source === "phantom"
  return (
    <div
      role="option"
      id={domIdFor(item.key)}
      aria-selected={selected}
      data-item-key={item.key}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 select-none",
        dimmed && "opacity-50"
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-[6px] p-1",
          selected && "bg-black/[0.09] dark:bg-white/[0.12]"
        )}
      >
        <FinderIcon kind={iconKind(item)} glyphId={glyphFor(item)} size={size} />
      </span>
      {rename !== "off" ? (
        <RenameField
          className="w-full max-w-[9rem] [&_input]:text-center"
          initialName={item.name}
          isFile={item.kind === "file"}
          saving={rename === "saving"}
          onCommit={(name) => (isPhantom ? c.commitNew(name) : c.commitRename(item, name))}
          onCancel={() => (isPhantom ? c.cancelNew() : c.dispatch({ type: "renameEnd" }))}
        />
      ) : (
        <span className="line-clamp-2 max-w-full text-center text-[12px] leading-[15px] break-words">
          <span
            className={cn(
              "rounded-[4px] px-1 py-px box-decoration-clone",
              selected && (emphasized ? "bg-mac-selection text-white" : "bg-mac-selection-inactive")
            )}
            title={item.name}
          >
            {item.name}
          </span>
        </span>
      )}
      {info ? (
        <span className="max-w-full truncate text-[11px] leading-[13px] text-mac-accent">{info}</span>
      ) : null}
    </div>
  )
}

export function IconView() {
  const c = useFinder()
  /** Finder "item info": item count / size, or the username with credentials. */
  const itemInfo = (item: FinderItem) => {
    if (c.showCredentials && item.kind === "file" && item.source === "vault") {
      const state = c.credentials.get(item.path)
      if (state?.status === "ready" && state.account.username) return state.account.username
    }
    return infoText(item)
  }
  const { contentRef } = c
  const width = useElementWidth(contentRef)
  const size = c.prefs.iconSize
  const cell = Math.max(92, size + 40)
  const cols = Math.max(1, Math.floor((Math.max(0, width - PAD * 2) + GAP) / (cell + GAP)))
  const { emphasized, surfaceProps } = useViewSurface({ rowLength: cols })
  const { items } = c.model
  const { selection, rename, phantom, clipboard } = c.state

  return (
    <ItemsContextMenu>
      <div
        {...surfaceProps}
        ref={contentRef}
        role="listbox"
        aria-label={c.model.title}
        className="h-full overflow-y-auto overscroll-contain outline-none"
      >
        {items.length === 0 && c.model.mode === "search" ? (
          <p className="pt-16 text-center text-[13px] text-mac-label-3">No Results</p>
        ) : null}
        <div
          className="grid content-start"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cell}px, 1fr))`,
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
              <IconCell
                key={item.key}
                item={item}
                size={size}
                selected={selection.keys.has(item.key)}
                emphasized={emphasized}
                dimmed={c.mutations.pendingKeys.has(item.key) || isCut(clipboard, item)}
                info={c.prefs.showItemInfo ? itemInfo(item) : null}
                rename={editing}
              />
            )
          })}
        </div>
      </div>
    </ItemsContextMenu>
  )
}
