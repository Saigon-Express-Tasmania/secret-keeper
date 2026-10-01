import { useMemo, useState } from "react"
import { Icon } from "@iconify/react"
import { Link2, Search } from "lucide-react"

import { NodeIcon } from "@/components/icons/NodeIcon"
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
import { Label } from "@/components/ui/label"
import {
  ICON_GROUP_LABELS,
  ICON_GROUP_ORDER,
  iconsForPicker,
  type CatalogIcon,
  type IconGroupId,
} from "@/lib/icons/catalog"
import {
  MAX_ICON_URL_LENGTH,
  isExternalIconUrl,
  parseExternalIconUrl,
} from "@/lib/icons/external"
import { cn } from "@/lib/utils"

type IconPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current icon: catalog id or `https://` image URL. */
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
  // Catalog selection; an external URL lives in `urlInput` instead.
  const [pending, setPending] = useState<string | undefined>(() =>
    initialCatalogValue(value)
  )
  const [urlInput, setUrlInput] = useState(() => initialUrlValue(value))
  const [query, setQuery] = useState("")

  // Sync pending when dialog opens
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setPending(initialCatalogValue(value))
      setUrlInput(initialUrlValue(value))
      setQuery("")
    }
  }

  const usingUrl = urlInput.trim() !== ""
  const urlResult = usingUrl ? parseExternalIconUrl(urlInput) : null
  const selection = urlResult
    ? urlResult.ok
      ? urlResult.url
      : undefined
    : pending

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
    if (selection) {
      onSelect(selection)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick a built-in icon for this {kind ?? "item"} ({icons.length}{" "}
            available, stored offline) or use an image URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="icon-url">Image URL</Label>
          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
              {urlResult?.ok ? (
                <NodeIcon iconId={urlResult.url} kind={kind ?? "file"} size={24} />
              ) : (
                <Link2 className="size-4 text-muted-foreground" />
              )}
            </div>
            <Input
              id="icon-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_ICON_URL_LENGTH}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/logo.png"
              aria-invalid={urlResult ? !urlResult.ok : undefined}
              aria-describedby="icon-url-hint"
            />
          </div>
          {urlResult && !urlResult.ok ? (
            <p id="icon-url-hint" className="text-xs text-destructive" role="alert">
              {urlResult.error}
            </p>
          ) : (
            <p id="icon-url-hint" className="text-xs text-muted-foreground">
              HTTPS images only. The image is loaded from that site each time
              it&apos;s shown, so the host can see when the vault is viewed.
            </p>
          )}
        </div>

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
                    const selected = !usingUrl && pending === icon.id
                    return (
                      <button
                        key={icon.id}
                        type="button"
                        title={icon.label}
                        onClick={() => {
                          setPending(icon.id)
                          setUrlInput("")
                        }}
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
          <Button type="button" disabled={!selection} onClick={handleConfirm}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function initialCatalogValue(value: string | undefined): string | undefined {
  return value && !isExternalIconUrl(value) ? value : undefined
}

function initialUrlValue(value: string | undefined): string {
  return value && isExternalIconUrl(value) ? value : ""
}
