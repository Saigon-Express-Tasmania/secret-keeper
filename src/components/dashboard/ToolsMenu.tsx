import {
  Download,
  KeyRound,
  Loader2,
  Upload,
  Wrench,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ToolsMenuProps = {
  disabled?: boolean
  exporting?: boolean
  onExport: () => void
  onImport: () => void
  onChangePassword: () => void
}

export function ToolsMenu({
  disabled = false,
  exporting = false,
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
