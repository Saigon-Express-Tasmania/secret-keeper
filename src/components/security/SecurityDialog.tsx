import { useEffect, useState, type ReactNode } from "react"
import { KeyRound, Laptop, LifeBuoy, MonitorSmartphone, ShieldCheck, Smartphone, Timer } from "lucide-react"

import { ChangeMasterPasswordDialog } from "@/components/dashboard/ChangeMasterPasswordDialog"
import { EmergencyKitView } from "@/components/security/EmergencyKitView"
import { StepUpDialog } from "@/components/security/StepUpDialog"
import { TotpDisableDialog } from "@/components/security/TotpDisableDialog"
import { TotpSetupDialog } from "@/components/security/TotpSetupDialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useVault } from "@/context/VaultContext"
import { parseKey } from "@/lib/crypto/keys"
import { loadDevice } from "@/lib/device/deviceStore"
import { deviceLabel } from "@/lib/device/label"
import {
  AUTO_LOCK_CHOICES,
  readAutoLockMinutes,
  writeAutoLockMinutes,
} from "@/lib/prefs/autoLock"
import { describeError } from "@/lib/vault/errors"
import { recoveryProof, type EmergencyKit } from "@/lib/vault/vaultSession"
import type { DeviceInfo } from "@/shared/api"
import { wipe } from "@/shared/bytes"

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

const day = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleDateString()

export function SecurityDialog({ open, onOpenChange }: SecurityDialogProps) {
  const {
    vault,
    rekey,
    secretKeyText,
    forgetThisDevice,
    passwordProof,
    verifyPassword,
    accountRequest,
    saving,
  } = useVault()
  const [stepUp, setStepUp] = useState<StepUp | null>(null)
  const [kit, setKit] = useState<EmergencyKit | null>(null)
  const [changePassword, setChangePassword] = useState(false)
  const [totpSetup, setTotpSetup] = useState(false)
  const [totpDisable, setTotpDisable] = useState(false)
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null)
  const [devicesError, setDevicesError] = useState<string | null>(null)
  const [autoLock, setAutoLock] = useState(readAutoLockMinutes)

  // The server is the source of truth for factors and trusted devices.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    accountRequest({ op: "status" }).then(
      (status) => {
        if (cancelled) return
        setDevices(status.devices)
        setDevicesError(null)
      },
      (error: unknown) => {
        if (!cancelled) setDevicesError(describeError(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [open, accountRequest])

  if (!vault) return null

  const serverTrustedUntil = vault.device.exp ? day(vault.device.exp) : null
  const localRecord = loadDevice(vault.name)
  const rememberedUntil = localRecord ? new Date(localRecord.exp).toLocaleDateString() : null
  const otherDevices = devices?.filter((device) => !device.current) ?? []

  function showSecretKey() {
    setStepUp({
      title: "Show your Secret Key",
      description: "Confirm your master password to display the Secret Key.",
      confirmLabel: "Show",
      run: async (password) => {
        await verifyPassword(password)
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

  function revoke(device: DeviceInfo | "all") {
    setStepUp({
      title: device === "all" ? "Revoke all trusted devices" : `Revoke “${device.label}”`,
      description:
        device === "all"
          ? "Every device, including this one, will need a second factor at its next unlock."
          : "That device will need a second factor at its next unlock.",
      confirmLabel: "Revoke",
      run: async (password) => {
        const status = await accountRequest({
          op: "devices.revoke",
          proof: await passwordProof(password),
          id: device === "all" ? "all" : device.id,
        })
        setDevices(status.devices)
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

              <Section icon={<Smartphone className="size-4" />} title="Two-step verification">
                {vault.account.totp ? (
                  <>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-emerald-700">On.</span> Devices you
                      haven't trusted need a code from your authenticator app at every unlock.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setTotpDisable(true)}>
                      Turn off
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      Off. With an authenticator app, someone who learns your password and
                      Secret Key still can't unlock the vault on a new device.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setTotpSetup(true)}>
                      Set up authenticator app
                    </Button>
                  </>
                )}
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
                  onClick={() =>
                    void forgetThisDevice().then(() =>
                      setDevices((list) => list?.filter((device) => !device.current) ?? null)
                    )
                  }
                >
                  Forget this device
                </Button>
              </Section>

              <Section icon={<MonitorSmartphone className="size-4" />} title="Trusted devices">
                <p className="text-muted-foreground">
                  Trusted devices skip the second factor for 30 days. A revoked device may
                  still remember your Secret Key until you issue a new one.
                </p>
                {devicesError ? (
                  <p className="text-destructive">{devicesError}</p>
                ) : devices === null ? (
                  <p className="text-muted-foreground">Loading…</p>
                ) : devices.length === 0 ? (
                  <p className="text-muted-foreground">
                    None. Tick “Trust this device” when you unlock with a second factor.
                  </p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {devices.map((device) => (
                      <li key={device.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {device.label}
                            {device.current ? (
                              <span className="ml-2 text-xs font-normal text-emerald-700">this device</span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Trusted {day(device.created)} · until {day(device.exp)}
                          </p>
                        </div>
                        {device.current ? null : (
                          <Button size="sm" variant="outline" onClick={() => revoke(device)}>
                            Revoke
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {devices && devices.length > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => revoke("all")}>
                    {otherDevices.length === devices.length ? "Revoke all" : "Revoke all, including this one"}
                  </Button>
                ) : null}
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
          if (revokeDevices) setDevices([])
        }}
      />

      <TotpSetupDialog
        open={totpSetup}
        onOpenChange={setTotpSetup}
        vaultName={vault.name}
        onEnable={async ({ secret, code, password, trust }) => {
          const status = await accountRequest({
            op: "totp.enable",
            proof: await passwordProof(password),
            secret,
            code,
            trustDevice: trust,
            deviceLabel: deviceLabel(),
          })
          setDevices(status.devices)
        }}
      />

      <TotpDisableDialog
        open={totpDisable}
        onOpenChange={setTotpDisable}
        onDisable={async (input) => {
          let proof
          if (input.kind === "code") {
            proof = await passwordProof(input.password)
          } else {
            const recoveryKey = parseKey("RK1", input.recoveryKey)
            proof = recoveryProof(recoveryKey)
            wipe(recoveryKey)
          }
          const status = await accountRequest({
            op: "totp.disable",
            proof,
            ...(input.kind === "code" ? { code: input.code } : {}),
          })
          setDevices(status.devices)
        }}
      />
    </>
  )
}
