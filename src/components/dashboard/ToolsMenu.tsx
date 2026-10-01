import {
  Download,
  Eye,
  KeyRound,
  LayoutGrid,
  List,
  Loader2,
  Upload,
  Wrench,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ListingViewMode } from "@/lib/prefs/listingView"

type ToolsMenuProps = {
  disabled?: boolean
  exporting?: boolean
  viewMode: ListingViewMode
  onViewModeChange: (mode: ListingViewMode) => void
  onExport: () => void
  onImport: () => void
  onChangePassword: () => void
}

export function ToolsMenu({
  disabled = false,
  exporting = false,
  viewMode,
  onViewModeChange,
  onExport,
  onImport,
  onChangePassword,
}: ToolsMenuProps) {
  const busy = disabled || exporting

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className="border-emerald-300 bg-white/80 text-emerald-900 hover:bg-emerald-50 hover:text-emerald-950"
        >
          {exporting ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Wrench />
          )}
          <span className="hidden sm:inline">
            {exporting ? "Exporting…" : "Tools"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Eye />
            View
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={viewMode}
              onValueChange={(value) =>
                onViewModeChange(value as ListingViewMode)
              }
            >
              <DropdownMenuRadioItem value="grid">
                <LayoutGrid />
                Grid
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="list">
                <List />
                List
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            onExport()
          }}
        >
          <Download />
          Export
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            onImport()
          }}
        >
          <Upload />
          Import
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            onChangePassword()
          }}
        >
          <KeyRound />
          Change password
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
