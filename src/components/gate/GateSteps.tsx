import { useState, type FormEvent } from "react"
import { AlertTriangle, Fingerprint, KeyRound, Mail, ShieldCheck } from "lucide-react"

import {
  BusyLabel,
  Field,
  FormError,
  LinkButton,
  TrustDeviceCheckbox,
} from "@/components/gate/GateParts"
import { Button } from "@/components/ui/button"
import { masterPasswordProblem } from "@/lib/security/password"
import type { SecondFactorMethod } from "@/shared/api"

type Busy = { busy: boolean; progress?: number | null; error: string | null }

// --- Unlock -----------------------------------------------------------------------

export function UnlockForm({
  busy,
  progress,
  error,
  notice,
  onSubmit,
  onCreate,
  onRecover,
}: Busy & {
  notice?: string | null
  onSubmit: (vault: string, password: string, trustDevice: boolean) => void
  onCreate: () => void
  onRecover: () => void
}) {
  const [vault, setVault] = useState("")
  const [password, setPassword] = useState("")
  const [trust, setTrust] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit(vault, password, trust)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field
        id="username"
        label="Vault name"
        value={vault}
        onChange={setVault}
        autoComplete="username"
        placeholder="vault"
        disabled={busy}
        required
      />
      <Field
        id="master-password"
        label="Master password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        placeholder="••••••••"
        disabled={busy}
        required
      />
      <TrustDeviceCheckbox checked={trust} onChange={setTrust} disabled={busy} />
      <FormError message={error} />
      {!error && notice ? (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <BusyLabel label="Unlocking…" progress={progress} /> : "Unlock"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        <LinkButton onClick={onCreate} disabled={busy}>
          Create a vault
        </LinkButton>
        <LinkButton onClick={onRecover} disabled={busy}>
          Use Recovery Key
        </LinkButton>
      </div>
    </form>
  )
}

// --- Create -----------------------------------------------------------------------

export type CreateInput = {
  vault: string
  password: string
  setupCode: string
  trustDevice: boolean
}

export function CreateForm({
  busy,
  progress,
  error,
  onSubmit,
  onBack,
}: Busy & { onSubmit: (input: CreateInput) => void; onBack: () => void }) {
  const [vault, setVault] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [setupCode, setSetupCode] = useState("")
  const [trust, setTrust] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const problem = masterPasswordProblem(password, vault.trim())
    if (problem) return setLocalError(problem)
    if (password !== confirm) return setLocalError("The passwords do not match.")
    setLocalError(null)
    onSubmit({ vault, password, setupCode, trustDevice: trust })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field
        id="new-vault"
        label="Vault name"
        value={vault}
        onChange={setVault}
        autoComplete="username"
        placeholder="family"
        hint="Lowercase letters, digits and hyphens."
        disabled={busy}
        required
      />
      <Field
        id="new-password"
        label="Master password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint="At least 12 characters. A few random words work well."
        disabled={busy}
        required
      />
      <Field
        id="confirm-password"
        label="Confirm master password"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={busy}
        required
      />
      <Field
        id="setup-code"
        label="Setup code"
        type="password"
        value={setupCode}
        onChange={setSetupCode}
        autoComplete="off"
        hint="Set by whoever runs this server."
        disabled={busy}
        required
      />
      <TrustDeviceCheckbox checked={trust} onChange={setTrust} disabled={busy} />
      <FormError message={localError ?? error} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <BusyLabel label="Creating…" progress={progress} /> : "Create vault"}
      </Button>
      <LinkButton onClick={onBack} disabled={busy}>
        Back to unlock
      </LinkButton>
    </form>
  )
}

// --- Recovery Key -------------------------------------------------------------------

export function RecoverForm({
  busy,
  error,
  onSubmit,
  onBack,
}: Busy & {
  onSubmit: (vault: string, recoveryKey: string, trustDevice: boolean) => void
  onBack: () => void
}) {
  const [vault, setVault] = useState("")
  const [key, setKey] = useState("")
  const [trust, setTrust] = useState(false)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(vault, key, trust)
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-muted-foreground">
        The Recovery Key from your Emergency Kit opens the vault without the password. You
        will set a new master password next.
      </p>
      <Field id="recover-vault" label="Vault name" value={vault} onChange={setVault} disabled={busy} required />
      <Field
        id="recovery-key"
        label="Recovery Key"
        value={key}
        onChange={setKey}
        placeholder="RK1-…"
        autoComplete="off"
        mono
        disabled={busy}
        required
      />
      <TrustDeviceCheckbox checked={trust} onChange={setTrust} disabled={busy} />
      <FormError message={error} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <BusyLabel label="Opening…" /> : "Continue"}
      </Button>
      <LinkButton onClick={onBack} disabled={busy}>
        Back to unlock
      </LinkButton>
    </form>
  )
}

// --- Second factor ----------------------------------------------------------------

export function SecondFactorStep({
  methods,
  busy,
  error,
  onTotp,
  onEmailLink,
  onRecover,
  onBack,
}: Busy & {
  methods: SecondFactorMethod[]
  onTotp: (code: string) => void
  onEmailLink?: () => void
  onRecover: () => void
  onBack: () => void
}) {
  const [code, setCode] = useState("")
  const hasTotp = methods.includes("totp")
  // With TOTP on, a link does not replace the code; it can still replace the
  // Secret Key (email unlock), which the Secret Key step offers.
  const hasEmail = methods.includes("email") && !hasTotp && !!onEmailLink

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4 text-emerald-700" />
        New device — confirm it's you
      </div>
      {hasTotp ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            onTotp(code.replace(/\s/g, ""))
          }}
        >
          <Field
            id="totp-code"
            label="Code from your authenticator app"
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
            placeholder="123456"
            mono
            autoFocus
            disabled={busy}
            required
          />
          <Button type="submit" disabled={busy || code.replace(/\s/g, "").length !== 6}>
            {busy ? <BusyLabel label="Checking…" /> : "Verify"}
          </Button>
        </form>
      ) : null}
      {hasEmail ? (
        <>
          <p className="text-sm text-muted-foreground">
            We'll email a one-time link to the address on this vault. Open it on this device.
          </p>
          <Button type="button" disabled={busy} onClick={onEmailLink}>
            {busy ? <BusyLabel label="Sending…" /> : <><Mail /> Email me a sign-in link</>}
          </Button>
        </>
      ) : null}
      <FormError message={error} />
      <div className="flex flex-wrap justify-between gap-2">
        <LinkButton onClick={onBack} disabled={busy}>
          Back
        </LinkButton>
        <LinkButton onClick={onRecover} disabled={busy}>
          Use Recovery Key
        </LinkButton>
      </div>
    </div>
  )
}

// --- Sign-in link (/verify) ---------------------------------------------------------

export function VerifyForm({
  vault,
  busy,
  progress,
  error,
  onSubmit,
  onCancel,
}: Busy & {
  vault: string
  onSubmit: (password: string, trustDevice: boolean) => void
  onCancel: () => void
}) {
  const [password, setPassword] = useState("")
  const [trust, setTrust] = useState(true)
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(password, trust)
      }}
    >
      <input type="text" name="username" autoComplete="username" value={vault} readOnly hidden />
      <p className="text-sm">
        Vault <span className="font-medium">{vault}</span>. Enter your master password to finish
        signing in on this device.
      </p>
      <Field
        id="master-password"
        label="Master password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        placeholder="••••••••"
        autoFocus
        disabled={busy}
        required
      />
      <TrustDeviceCheckbox checked={trust} onChange={setTrust} disabled={busy} />
      <FormError message={error} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <BusyLabel label="Unlocking…" progress={progress} /> : "Unlock"}
      </Button>
      <div>
        <LinkButton onClick={onCancel} disabled={busy}>
          Cancel
        </LinkButton>
      </div>
    </form>
  )
}

export function BrokenLinkStep({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>
        This sign-in link is incomplete or was already opened. Links work once, for 15
        minutes. Request a new one from the unlock screen.
      </p>
      <Button type="button" onClick={onBack}>
        Go to unlock
      </Button>
    </div>
  )
}

// --- Email sent -------------------------------------------------------------------

export function EmailSentStep({ to, onBack }: { to: string; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Mail className="size-4 text-emerald-700" />
        Check your email
      </div>
      <p>
        We sent a sign-in link to <span className="font-medium">{to}</span>. Open it on the
        device you want to unlock (it works once, for 15 minutes) and enter your master
        password there.
      </p>
      <p className="text-muted-foreground">
        You can close this page. No email? Check spam, or go back and try again in a few
        minutes.
      </p>
      <div>
        <LinkButton onClick={onBack}>Back</LinkButton>
      </div>
    </div>
  )
}

// --- Secret Key -------------------------------------------------------------------

export function SecretKeyStep({
  reason,
  busy,
  error,
  onSubmit,
  onEmailLink,
  onRecover,
  onBack,
}: Busy & {
  reason: "missing" | "wrong"
  onSubmit: (text: string) => void
  onEmailLink?: () => void
  onRecover: () => void
  onBack: () => void
}) {
  const [text, setText] = useState("")
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(text)
      }}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4 text-emerald-700" />
        {reason === "wrong" ? "That Secret Key didn't match" : "Enter your Secret Key"}
      </div>
      <p className="text-sm text-muted-foreground">
        Your password is correct. This device doesn't know your Secret Key yet — it's on your
        Emergency Kit (starts with SK1-).
      </p>
      <Field
        id="secret-key"
        label="Secret Key"
        value={text}
        onChange={setText}
        placeholder="SK1-…"
        autoComplete="off"
        mono
        autoFocus
        disabled={busy}
        required
      />
      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {busy ? <BusyLabel label="Opening…" /> : "Unlock"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        <LinkButton onClick={onBack} disabled={busy}>
          Back
        </LinkButton>
        {onEmailLink ? (
          <LinkButton onClick={onEmailLink} disabled={busy}>
            Email me a link instead
          </LinkButton>
        ) : null}
        <LinkButton onClick={onRecover} disabled={busy}>
          Use Recovery Key
        </LinkButton>
      </div>
    </form>
  )
}

// --- Passkey ----------------------------------------------------------------------

export function PasskeyStep({
  busy,
  error,
  onUse,
  onRecover,
  onBack,
}: Busy & { onUse: () => void; onRecover: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Fingerprint className="size-4 text-emerald-700" />
        Use your passkey
      </div>
      <p className="text-sm text-muted-foreground">
        This vault also needs one of its passkeys or security keys. Your browser will ask for a
        touch, PIN or biometrics.
      </p>
      <FormError message={error} />
      <Button type="button" autoFocus disabled={busy} onClick={onUse}>
        {busy ? <BusyLabel label="Waiting for the passkey…" /> : "Use passkey"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        <LinkButton onClick={onBack} disabled={busy}>
          Back
        </LinkButton>
        <LinkButton onClick={onRecover} disabled={busy}>
          Use Recovery Key
        </LinkButton>
      </div>
    </div>
  )
}

// --- Rollback warning --------------------------------------------------------------

export function RollbackStep({
  message,
  busy,
  onContinue,
  onCancel,
}: {
  message: string
  busy: boolean
  onContinue: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>{message}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Continue only if you restored a backup yourself. Otherwise cancel and check your
        storage.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={onContinue} disabled={busy}>
          Open anyway
        </Button>
      </div>
    </div>
  )
}

// --- Forced re-key after recovery ---------------------------------------------------

export type RecoveryRekeyInput = {
  password: string
  newSecretKey: boolean
  revokeDevices: boolean
}

export function RecoveryRekeyStep({
  vaultName,
  busy,
  progress,
  error,
  onSubmit,
}: Busy & { vaultName: string; onSubmit: (input: RecoveryRekeyInput) => void }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [newSecretKey, setNewSecretKey] = useState(true)
  const [revokeDevices, setRevokeDevices] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const problem = masterPasswordProblem(password, vaultName)
        if (problem) return setLocalError(problem)
        if (password !== confirm) return setLocalError("The passwords do not match.")
        setLocalError(null)
        onSubmit({ password, newSecretKey, revokeDevices })
      }}
    >
      <p className="text-sm text-muted-foreground">
        The Recovery Key worked. Set a new master password; a new Recovery Key is issued
        because this one has now been used.
      </p>
      <Field
        id="recovered-password"
        label="New master password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        disabled={busy}
        required
      />
      <Field
        id="recovered-confirm"
        label="Confirm new master password"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={busy}
        required
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={newSecretKey} onChange={(e) => setNewSecretKey(e.target.checked)} />
        Also issue a new Secret Key
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={revokeDevices} onChange={(e) => setRevokeDevices(e.target.checked)} />
        Sign out all trusted devices
      </label>
      <FormError message={localError ?? error} />
      <Button type="submit" disabled={busy}>
        {busy ? <BusyLabel label="Saving…" progress={progress} /> : "Set password"}
      </Button>
    </form>
  )
}
