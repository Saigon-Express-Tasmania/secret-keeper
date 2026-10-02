import { ChangeMasterPasswordDialog } from "@/components/dashboard/ChangeMasterPasswordDialog"
import { FinderContext } from "@/components/dashboard/finderContext"
import { FinderMenuBar } from "@/components/dashboard/FinderMenuBar"
import { FinderWindow } from "@/components/dashboard/FinderWindow"
import { GetInfoDialog } from "@/components/dashboard/GetInfoDialog"
import { useFinderController } from "@/components/dashboard/hooks/useFinderController"
import { useGlobalShortcuts } from "@/components/dashboard/hooks/useGlobalShortcuts"
import { IconPickerDialog } from "@/components/dashboard/IconPickerDialog"
import { ImportVaultDialog } from "@/components/dashboard/ImportVaultDialog"
import { KeyboardShortcutsDialog } from "@/components/dashboard/KeyboardShortcutsDialog"
import { QuickLookPanel } from "@/components/dashboard/QuickLookPanel"
import { UnsavedChangesDialog } from "@/components/dashboard/UnsavedChangesDialog"
import { AppIcon } from "@/components/mac/AppIcon"
import { Desktop } from "@/components/mac/Desktop"
import { DesktopIcon } from "@/components/mac/DesktopIcon"
import { pathBasename, type VaultArchive } from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

/** The unlocked vault as a macOS desktop with one Finder window. */
export function FinderApp({ archive }: { archive: VaultArchive }) {
  const c = useFinderController(archive)
  useGlobalShortcuts(c)
  const iconItem = c.dialogs.iconTarget

  return (
    <FinderContext.Provider value={c}>
      <Desktop
        menuBar={<FinderMenuBar />}
        icons={
          c.win.minimized ? (
            <DesktopIcon
              icon={<AppIcon size={56} />}
              label={c.vaultName}
              onOpen={() => {
                c.win.setMinimized(false)
                c.focusContent()
              }}
            />
          ) : null
        }
      >
        <div
          className={cn(
            "absolute inset-0 flex",
            c.prefs.zoomed ? "md:p-0" : "md:px-[4vw] md:pt-9 md:pb-12 xl:px-[7vw]"
          )}
        >
          <div className="mx-auto flex h-full w-full md:max-w-[1440px]">
            <FinderWindow />
          </div>
        </div>
      </Desktop>

      <QuickLookPanel />
      <GetInfoDialog />
      <IconPickerDialog
        open={iconItem !== null}
        onOpenChange={(open) => !open && c.dialogs.setIconTarget(null)}
        value={iconItem?.node.icon}
        kind={iconItem?.kind === "dir" ? "folder" : "file"}
        title={iconItem ? `Change Icon for “${iconItem.name}”` : "Change Icon"}
        onSelect={(id) => iconItem && void c.mutations.setIcon(iconItem.path, id)}
        onReset={iconItem?.node.icon ? () => void c.mutations.setIcon(iconItem.path, undefined) : undefined}
      />
      <UnsavedChangesDialog
        {...c.leave.dialog}
        fileName={pathBasename(c.model.path)}
      />
      <ChangeMasterPasswordDialog
        open={c.dialogs.changePasswordOpen}
        onOpenChange={c.dialogs.setChangePasswordOpen}
        busy={c.busy}
        onSubmit={c.changeMasterPassword}
      />
      <ImportVaultDialog
        open={c.dialogs.importOpen}
        onOpenChange={c.dialogs.setImportOpen}
        busy={c.busy}
        onSubmit={c.importVault}
      />
      <KeyboardShortcutsDialog />
    </FinderContext.Provider>
  )
}
