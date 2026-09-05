import { useMemo, useState } from "react"
import { Icon } from "@iconify/react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  ICON_GROUP_LABELS,
  ICON_GROUP_ORDER,
  iconsForPicker,
  type CatalogIcon,
  type IconGroupId,
} from "@/lib/icons/catalog"
import { cn } from "@/lib/utils"

type IconPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current icon id (catalog form). */
  value?: string
  kind?: "folder" | "file"
  onSelect: (iconId: string) => void
  title?: string
}

export function IconPickerDialog({
  open,
  onOpenChange,
  value,
  kind,
  onSelect,
  title = "Choose icon",
}: IconPickerDialogProps) {
  const [pending, setPending] = useState<string | undefined>(value)
  const [query, setQuery] = useState("")

  // Sync pending when dialog opens
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setPending(value)
      setQuery("")
    }
  }

  const icons = useMemo(() => iconsForPicker(kind), [kind])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return icons
    return icons.filter(
      (icon) =>
        icon.label.toLowerCase().includes(q) ||
        icon.name.toLowerCase().includes(q) ||
        icon.id.toLowerCase().includes(q)
    )
  }, [icons, query])

  const grouped = useMemo(() => {
    const map = new Map<IconGroupId, CatalogIcon[]>()
    for (const g of ICON_GROUP_ORDER) map.set(g, [])
    for (const icon of filtered) {
      map.get(icon.group)?.push(icon)
    }
    return ICON_GROUP_ORDER.filter((g) => (map.get(g)?.length ?? 0) > 0).map(
      (g) => ({ group: g, items: map.get(g)! })
    )
  }, [filtered])

  function handleConfirm() {
    if (pending) {
      onSelect(pending)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick a colorful icon for this {kind ?? "item"}. Icons stay offline
            in the vault ({icons.length} available).
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons…"
            aria-label="Search icons"
            className="pl-8"
            autoFocus
          />
        </div>

        <div className="max-h-[28rem] space-y-4 overflow-y-auto py-2">
          {grouped.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No icons match “{query.trim()}”.
            </p>
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group}>
                <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {ICON_GROUP_LABELS[group]}
                  <span className="ml-1 font-normal normal-case">
                    ({items.length})
                  </span>
                </div>
                <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
                  {items.map((icon) => {
                    const selected = pending === icon.id
                    return (
                      <button
                        key={icon.id}
                        type="button"
                        title={icon.label}
                        onClick={() => setPending(icon.id)}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-md border p-1.5 transition-colors",
                          selected
                            ? "border-primary bg-accent ring-2 ring-primary/40"
                            : "border-transparent hover:bg-accent/60"
                        )}
                        aria-label={icon.label}
                        aria-pressed={selected}
                      >
                        <Icon icon={icon.id} width={22} height={22} />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!pending} onClick={handleConfirm}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
