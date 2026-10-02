import { useEffect, useState, type ReactNode } from "react"
import {
  Fingerprint,
  KeyRound,
  Laptop,
  LifeBuoy,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  Timer,
} from "lucide-react"

import { ChangeMasterPasswordDialog } from "@/components/dashboard/ChangeMasterPasswordDialog"
import { EmailDialog } from "@/components/security/EmailDialog"
import { EmergencyKitView } from "@/components/security/EmergencyKitView"
import { PasskeyAddDialog } from "@/components/security/PasskeyAddDialog"
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
import { discardPasskey, passkeysSupported } from "@/lib/webauthn/prf"
import type { AccountStatus, DeviceInfo } from "@/shared/api"
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
  const [emailDialog, setEmailDialog] = useState(false)
  const [passkeyAdd, setPasskeyAdd] = useState(false)
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [autoLock, setAutoLock] = useState(readAutoLockMinutes)

  // The server is the source of truth for factors and trusted devices.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    accountRequest({ op: "status" }).then(
      (next) => {
        if (cancelled) return
        setStatus(next)
        setStatusError(null)
      },
      (error: unknown) => {
        if (!cancelled) setStatusError(describeError(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [open, accountRequest])

  if (!vault) return null
  const devices = status?.devices ?? null
  const setDevices = (update: (list: DeviceInfo[]) => DeviceInfo[]) =>
    setStatus((current) => (current ? { ...current, devices: update(current.devices) } : current))

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

  function setEmailUnlock(on: boolean) {
    setStepUp({
      title: on ? "Turn on email unlock" : "Turn off email unlock",
      description: on
        ? "A sign-in link plus your master password will open the vault on a new device without the Secret Key. Your other open sessions are signed out."
        : "New devices will need the Secret Key again. Your other open sessions are signed out.",
      confirmLabel: on ? "Turn on" : "Turn off",
      run: async (password) => {
        await rekey({ proof: { password }, emailUnlock: on })
      },
    })
  }

  function setRequirePasskey(on: boolean) {
    setStepUp({
      title: on ? "Require a passkey" : "Stop requiring a passkey",
      description: on
        ? "Every unlock will also need a touch of one of this vault's passkeys. The Recovery Key still works without one. Your other open sessions are signed out."
        : "Unlocking will no longer need a passkey. Your other open sessions are signed out.",
      confirmLabel: on ? "Require" : "Stop requiring",
      run: async (password) => {
        await rekey({ proof: { password }, requirePasskey: on })
      },
    })
  }

  function removePasskey(passkey: { id: string; label: string }) {
    setStepUp({
      title: `Remove “${passkey.label}”`,
      description: "This passkey will no longer unlock the vault.",
      confirmLabel: "Remove",
      run: async (password) => {
        await rekey({ proof: { password }, removePasskeys: [passkey.id] })
        discardPasskey(passkey.id)
      },
    })
  }

  function removeEmail() {
    setStepUp({
      title: "Remove email address",
      description: "No more sign-in links or security alerts. A notice goes to the old address.",
      confirmLabel: "Remove",
      run: async (password) => {
        setStatus(await accountRequest({ op: "email.remove", proof: await passwordProof(password) }))
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
        setStatus(
          await accountRequest({
            op: "devices.revoke",
            proof: await passwordProof(password),
            id: device === "all" ? "all" : device.id,
          })
        )
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

              <Section icon={<Mail className="size-4" />} title="Email">
                {vault.account.email ? (
                  <p className="text-muted-foreground">
                    Sign-in links and security alerts go to{" "}
                    <span className="font-medium text-foreground">{vault.account.email}</span>.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Add an address for sign-in links on new devices and for alerts (Recovery
                    Key used, new trusted device, password changed).
                  </p>
                )}
                {status?.pendingEmail ? (
                  <p className="text-muted-foreground">
                    Waiting for the code sent to {status.pendingEmail}.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEmailDialog(true)}>
                    {status?.pendingEmail ? "Enter code" : vault.account.email ? "Change" : "Add email"}
                  </Button>
                  {vault.account.email ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={vault.account.emailUnlock}
                      title={vault.account.emailUnlock ? "Turn off email unlock first" : undefined}
                      onClick={removeEmail}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                {vault.account.email || vault.account.emailUnlock ? (
                  <div className="space-y-2 border-t pt-2">
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Email unlock {vault.account.emailUnlock ? "on" : "off"}.
                      </span>{" "}
                      {vault.account.emailUnlock
                        ? "On a new device, a sign-in link plus your master password replaces the Secret Key (your authenticator code is still needed when it's on). Someone who gets into your email and knows your password could open the vault."
                        : "Lets a sign-in link replace the Secret Key on a new device, so you can sign in without your Emergency Kit."}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving || (!vault.account.emailUnlock && !vault.account.email)}
                      onClick={() => setEmailUnlock(!vault.account.emailUnlock)}
                    >
                      {vault.account.emailUnlock ? "Turn off email unlock" : "Turn on email unlock"}
                    </Button>
                  </div>
                ) : null}
              </Section>

              {passkeysSupported() || vault.passkeys.length > 0 ? (
                <Section icon={<Fingerprint className="size-4" />} title="Passkeys">
                  <p className="text-muted-foreground">
                    {vault.requirePasskey ? (
                      <>
                        <span className="font-medium text-emerald-700">Required.</span> Every
                        unlock also needs a touch of one of these passkeys. The Recovery Key
                        still works without one.
                      </>
                    ) : vault.passkeys.length > 0 ? (
                      "Added, not required yet. Require one to need a touch at every unlock."
                    ) : (
                      "Need a touch of a passkey or security key (with PIN or biometrics) at every unlock, on top of your password and Secret Key."
                    )}
                  </p>
                  {vault.passkeys.length > 0 ? (
                    <ul className="divide-y rounded-md border">
                      {vault.passkeys.map((passkey) => {
                        const last = vault.requirePasskey && vault.passkeys.length === 1
                        return (
                          <li key={passkey.id} className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{passkey.label}</p>
                              {passkey.added ? (
                                <p className="text-xs text-muted-foreground">
                                  Added {new Date(passkey.added).toLocaleDateString()}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={saving || last}
                              title={last ? "Stop requiring a passkey first, or add another one" : undefined}
                              onClick={() => removePasskey(passkey)}
                            >
                              Remove
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving || !passkeysSupported() || vault.passkeys.length >= 10}
                      onClick={() => setPasskeyAdd(true)}
                    >
                      Add passkey
                    </Button>
                    {vault.passkeys.length > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => setRequirePasskey(!vault.requirePasskey)}
                      >
                        {vault.requirePasskey ? "Stop requiring" : "Require passkey"}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Passkeys only work on this site's address. Keep two, or your Recovery Key, in
                    case one is lost.
                  </p>
                </Section>
              ) : null}

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
                      setDevices((list) => list.filter((device) => !device.current))
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
                {statusError ? (
                  <p className="text-destructive">{statusError}</p>
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
          if (revokeDevices) setDevices(() => [])
        }}
      />

      <TotpSetupDialog
        open={totpSetup}
        onOpenChange={setTotpSetup}
        vaultName={vault.name}
        onEnable={async ({ secret, code, password, trust }) => {
          setStatus(
            await accountRequest({
              op: "totp.enable",
              proof: await passwordProof(password),
              secret,
              code,
              trustDevice: trust,
              deviceLabel: deviceLabel(),
            })
          )
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
          setStatus(
            await accountRequest({
              op: "totp.disable",
              proof,
              ...(input.kind === "code" ? { code: input.code } : {}),
            })
          )
        }}
      />

      <PasskeyAddDialog
        open={passkeyAdd}
        onOpenChange={setPasskeyAdd}
        vaultName={vault.name}
        existing={vault.passkeys.map((passkey) => passkey.id)}
        onVerify={verifyPassword}
        onAdd={async (enrollment, password) => {
          await rekey({ proof: { password }, addPasskey: enrollment })
        }}
      />

      <EmailDialog
        open={emailDialog}
        onOpenChange={setEmailDialog}
        pending={status?.pendingEmail ?? null}
        onSend={async (email, password) => {
          const next = await accountRequest({
            op: "email.set",
            proof: await passwordProof(password),
            email,
          })
          setStatus(next)
          return next.pendingEmail ?? email
        }}
        onConfirm={async (code) => {
          setStatus(await accountRequest({ op: "email.confirm", code }))
        }}
      />
    </>
  )
}
