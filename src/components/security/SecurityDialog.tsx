import { useState, type ReactNode } from "react"
import { KeyRound, Laptop, LifeBuoy, ShieldCheck, Timer } from "lucide-react"

import { ChangeMasterPasswordDialog } from "@/components/dashboard/ChangeMasterPasswordDialog"
import { EmergencyKitView } from "@/components/security/EmergencyKitView"
import { StepUpDialog } from "@/components/security/StepUpDialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useVault } from "@/context/VaultContext"
import { loadDevice } from "@/lib/device/deviceStore"
import {
  AUTO_LOCK_CHOICES,
  readAutoLockMinutes,
  writeAutoLockMinutes,
} from "@/lib/prefs/autoLock"
import type { EmergencyKit } from "@/lib/vault/vaultSession"

type SecurityDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type StepUp = {
  title: string
  description: ReactNode
  confirmLabel: string
  run: (password: string) => Promise<void>
}

export function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2 rounded-lg border bg-card/60 p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      <div className="space-y-2 text-sm">{children}</div>
    </section>
  )
}

export function SecurityDialog({ open, onOpenChange }: SecurityDialogProps) {
  const { vault, rekey, secretKeyText, forgetThisDevice, passwordProof, saving } = useVault()
  const [stepUp, setStepUp] = useState<StepUp | null>(null)
  const [kit, setKit] = useState<EmergencyKit | null>(null)
  const [changePassword, setChangePassword] = useState(false)
  const [autoLock, setAutoLock] = useState(readAutoLockMinutes)

  if (!vault) return null

  const serverTrustedUntil = vault.device.exp
    ? new Date(vault.device.exp * 1000).toLocaleDateString()
    : null
  const localRecord = loadDevice(vault.name)
  const rememberedUntil = localRecord ? new Date(localRecord.exp).toLocaleDateString() : null

  function showSecretKey() {
    setStepUp({
      title: "Show your Secret Key",
      description: "Confirm your master password to display the Secret Key.",
      confirmLabel: "Show",
      run: async (password) => {
        await passwordProof(password)
        setKit({ vault: vault!.name, secretKey: secretKeyText() })
      },
    })
  }

  function regenerate(which: "secret" | "recovery") {
    setStepUp({
      title: which === "secret" ? "New Secret Key" : "New Recovery Key",
      description:
        which === "secret"
          ? "Issues a new Secret Key. Devices that remember the old one will ask for the new key."
          : "Issues a new Recovery Key. The old one stops working immediately.",
      confirmLabel: "Generate",
      run: async (password) => {
        const result = await rekey({
          proof: { password },
          ...(which === "secret" ? { newSecretKey: true } : { newRecoveryKey: true }),
        })
        if (result.kit) setKit(result.kit)
      },
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-700" />
              Security
            </DialogTitle>
            <DialogDescription>
              Vault “{vault.name}”. Every change here asks for your master password.
            </DialogDescription>
          </DialogHeader>

          {kit ? (
            <EmergencyKitView kit={kit} onDone={() => setKit(null)} doneLabel="Done" />
          ) : (
            <div className="flex flex-col gap-3">
              <Section icon={<KeyRound className="size-4" />} title="Master password">
                <p className="text-muted-foreground">
                  Changing it also rotates the server keys, so old copies and backups stop
                  opening with the old password.
                </p>
                <Button size="sm" variant="outline" disabled={saving} onClick={() => setChangePassword(true)}>
                  Change master password
                </Button>
              </Section>

              <Section icon={<LifeBuoy className="size-4" />} title="Emergency Kit">
                <p className="text-muted-foreground">
                  Secret Key: needed on new devices. Recovery Key: opens the vault if you
                  forget your password.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={showSecretKey}>
                    Show Secret Key
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => regenerate("secret")}>
                    New Secret Key
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => regenerate("recovery")}>
                    New Recovery Key
                  </Button>
                </div>
              </Section>

              <Section icon={<Laptop className="size-4" />} title="This device">
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    {rememberedUntil
                      ? `Remembers your Secret Key until ${rememberedUntil}.`
                      : "Does not remember your Secret Key (asked at each unlock)."}
                  </li>
                  <li>
                    {serverTrustedUntil
                      ? `Skips the second factor until ${serverTrustedUntil}.`
                      : "Asks for a second factor, once you set one up."}
                  </li>
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!rememberedUntil && !serverTrustedUntil}
                  onClick={() => void forgetThisDevice()}
                >
                  Forget this device
                </Button>
              </Section>

              <Section icon={<Timer className="size-4" />} title="Auto-lock">
                <label className="flex items-center gap-2">
                  Lock after
                  <select
                    className="h-8 rounded-md border bg-background px-2"
                    value={autoLock}
                    onChange={(e) => {
                      const minutes = Number(e.target.value)
                      setAutoLock(minutes)
                      writeAutoLockMinutes(minutes)
                    }}
                  >
                    {AUTO_LOCK_CHOICES.map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                  of inactivity (this device; applies at next unlock).
                </label>
              </Section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <StepUpDialog
        open={stepUp !== null}
        onOpenChange={(next) => {
          if (!next) setStepUp(null)
        }}
        title={stepUp?.title ?? ""}
        description={stepUp?.description ?? ""}
        confirmLabel={stepUp?.confirmLabel}
        onConfirm={async (password) => {
          await stepUp?.run(password)
        }}
      />

      <ChangeMasterPasswordDialog
        open={changePassword}
        onOpenChange={setChangePassword}
        busy={saving}
        vaultName={vault.name}
        onSubmit={async (current, next, revokeDevices) => {
          await rekey({ proof: { password: current }, newPassword: next, revokeDevices })
        }}
      />
    </>
  )
}
