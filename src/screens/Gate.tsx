import { useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { Lock } from "lucide-react"

import {
  APP_BG_CREDIT_HREF,
  APP_BG_CREDIT_LABEL,
  AppBackdrop,
} from "@/components/AppBackdrop"
import {
  BrokenLinkStep,
  CreateForm,
  EmailSentStep,
  RecoverForm,
  RecoveryRekeyStep,
  RollbackStep,
  SecondFactorStep,
  SecretKeyStep,
  UnlockForm,
  VerifyForm,
  type CreateInput,
  type RecoveryRekeyInput,
} from "@/components/gate/GateSteps"
import { EmergencyKitView } from "@/components/security/EmergencyKitView"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useVault } from "@/context/VaultContext"
import { isApiError } from "@/lib/api/client"
import { parseKey } from "@/lib/crypto/keys"
import { deviceLabel } from "@/lib/device/label"
import { sessionDeps } from "@/lib/vault/deps"
import { describeError } from "@/lib/vault/errors"
import type { SignInLink } from "@/lib/vault/signInLink"
import {
  createVault,
  NeedSecretKeyError,
  openDownloadedVault,
  preparePasswordUnlock,
  prepareRecoveryUnlock,
  requestEmailLink,
  requestUnlock,
  RollbackError,
  wipePending,
  type DownloadedVault,
  type EmergencyKit,
  type OpenOptions,
  type PendingUnlock,
  type UnlockOptions,
  type VaultSession,
} from "@/lib/vault/vaultSession"
import type { SecondFactorMethod } from "@/shared/api"

type Mode = "unlock" | "create" | "recover" | "verify"

type Step =
  | { kind: "form" }
  | { kind: "secondFactor"; methods: SecondFactorMethod[] }
  | { kind: "emailSent"; to: string }
  | { kind: "secretKey"; downloaded: DownloadedVault; reason: "missing" | "wrong" }
  | { kind: "rollback"; downloaded: DownloadedVault; message: string; options: OpenOptions }
  | { kind: "recoveryRekey"; session: VaultSession; recoveryKey: Uint8Array }
  | { kind: "kit"; session: VaultSession; kit: EmergencyKit }

const LOCK_NOTICES: Record<string, string> = {
  idle: "Locked after a period of inactivity.",
  expired: "Your session ended. Unlock again.",
}

/**
 * Unlock, create and recover; with `signInLink` (the /verify page) it
 * finishes an emailed sign-in link instead. `undefined` = normal Gate,
 * `null` = /verify without a usable link.
 */
export function Gate({ signInLink }: { signInLink?: SignInLink | null }) {
  const { attach, lockReason } = useVault()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>(signInLink === undefined ? "unlock" : "verify")
  const [step, setStep] = useState<Step>({ kind: "form" })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef<PendingUnlock | null>(null)
  const trustRef = useRef(false)
  // Sent with every unlock attempt on /verify; the server uses it up on success.
  const emailTokenRef = useRef<string | null>(signInLink?.token ?? null)

  // Never leave derived keys behind if the Gate unmounts mid-flow.
  useEffect(() => () => wipePending(pendingRef.current), [])

  function resetTo(next: Mode) {
    wipePending(pendingRef.current)
    pendingRef.current = null
    if (mode === "verify") {
      // Leave /verify; the link stays unused.
      emailTokenRef.current = null
      navigate("/", { replace: true })
      return
    }
    setMode(next)
    setStep({ kind: "form" })
    setError(null)
    setProgress(null)
  }

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function finish(session: VaultSession) {
    wipePending(pendingRef.current)
    pendingRef.current = null
    emailTokenRef.current = null
    attach(session)
    navigate("/dashboard", { replace: true })
  }

  async function open(downloaded: DownloadedVault, options: OpenOptions = {}) {
    try {
      const { session, mustRekey } = await openDownloadedVault(sessionDeps, downloaded, options)
      if (mustRekey && downloaded.pending.mode === "recovery") {
        setStep({ kind: "recoveryRekey", session, recoveryKey: downloaded.pending.recoveryKey })
      } else {
        finish(session)
      }
    } catch (err) {
      if (err instanceof NeedSecretKeyError) {
        setStep({ kind: "secretKey", downloaded, reason: err.reason })
        if (err.reason === "wrong") setError(err.message)
        return
      }
      if (err instanceof RollbackError) {
        setStep({ kind: "rollback", downloaded, message: err.message, options })
        return
      }
      throw err
    }
  }

  async function attempt(pending: PendingUnlock, options: UnlockOptions) {
    try {
      const downloaded = await requestUnlock(sessionDeps, pending, {
        ...options,
        ...(emailTokenRef.current ? { emailToken: emailTokenRef.current } : {}),
        deviceLabel: deviceLabel(),
      })
      await open(downloaded)
    } catch (err) {
      if (isApiError(err, "second_factor_required")) {
        setStep({ kind: "secondFactor", methods: err.methods ?? [] })
        return
      }
      throw err
    }
  }

  const onUnlock = (vault: string, password: string, trust: boolean) =>
    run(async () => {
      trustRef.current = trust
      wipePending(pendingRef.current)
      const pending = await preparePasswordUnlock(sessionDeps, vault, password, setProgress)
      pendingRef.current = pending
      await attempt(pending, { trustDevice: trust })
    })

  const onVerify = (password: string, trust: boolean) =>
    run(async () => {
      if (!signInLink) return
      trustRef.current = trust
      wipePending(pendingRef.current)
      const pending = await preparePasswordUnlock(sessionDeps, signInLink.vault, password, setProgress)
      pendingRef.current = pending
      await attempt(pending, { trustDevice: trust })
    })

  const onEmailLink = () =>
    run(async () => {
      if (!pendingRef.current) return resetTo("unlock")
      const sent = await requestEmailLink(sessionDeps, pendingRef.current)
      // The link is finished on /verify (maybe another device); drop these keys.
      wipePending(pendingRef.current)
      pendingRef.current = null
      setStep({ kind: "emailSent", to: sent.to })
    })

  const onTotp = (code: string) =>
    run(async () => {
      if (!pendingRef.current) return resetTo("unlock")
      await attempt(pendingRef.current, { totp: code, trustDevice: trustRef.current })
    })

  const onSecretKey = (text: string) =>
    run(async () => {
      if (step.kind !== "secretKey") return
      await open(step.downloaded, { secretKey: parseKey("SK1", text) })
    })

  const onRollbackContinue = () =>
    run(async () => {
      if (step.kind !== "rollback") return
      await open(step.downloaded, { ...step.options, acceptRollback: true })
    })

  const onRecover = (vault: string, keyText: string, trust: boolean) =>
    run(async () => {
      trustRef.current = trust
      wipePending(pendingRef.current)
      const pending = prepareRecoveryUnlock(vault, parseKey("RK1", keyText))
      pendingRef.current = pending
      const downloaded = await requestUnlock(sessionDeps, pending, {
        trustDevice: trust,
        deviceLabel: deviceLabel(),
      })
      await open(downloaded)
    })

  const onRecoveryRekey = (input: RecoveryRekeyInput) =>
    run(async () => {
      if (step.kind !== "recoveryRekey") return
      const { kit } = await step.session.rekey({
        proof: { recoveryKey: step.recoveryKey },
        newPassword: input.password,
        newSecretKey: input.newSecretKey,
        newRecoveryKey: true,
        revokeDevices: input.revokeDevices,
        onProgress: setProgress,
      })
      setStep({ kind: "kit", session: step.session, kit: kit! })
    })

  const onCreate = (input: CreateInput) =>
    run(async () => {
      const { session, kit } = await createVault(sessionDeps, { ...input, onProgress: setProgress })
      setStep({ kind: "kit", session, kit })
    })

  const busyProps = { busy, progress, error }
  let title = "Credentials Keep"
  let description = "Enter your vault name and master password to unlock."
  let body: ReactNode

  switch (step.kind) {
    case "form":
      if (mode === "verify") {
        title = "Finish signing in"
        description = "You opened a sign-in link from your email."
        body = signInLink ? (
          <VerifyForm
            {...busyProps}
            vault={signInLink.vault}
            onSubmit={onVerify}
            onCancel={() => resetTo("unlock")}
          />
        ) : (
          <BrokenLinkStep onBack={() => resetTo("unlock")} />
        )
      } else if (mode === "create") {
        title = "Create a vault"
        description = "Your vault is encrypted in this browser before it is stored."
        body = <CreateForm {...busyProps} onSubmit={onCreate} onBack={() => resetTo("unlock")} />
      } else if (mode === "recover") {
        title = "Recover your vault"
        description = "Use the Recovery Key from your Emergency Kit."
        body = <RecoverForm {...busyProps} onSubmit={onRecover} onBack={() => resetTo("unlock")} />
      } else {
        body = (
          <UnlockForm
            {...busyProps}
            notice={lockReason ? (LOCK_NOTICES[lockReason] ?? null) : null}
            onSubmit={onUnlock}
            onCreate={() => resetTo("create")}
            onRecover={() => resetTo("recover")}
          />
        )
      }
      break
    case "secondFactor":
      description = "This device isn't trusted yet."
      body = (
        <SecondFactorStep
          {...busyProps}
          methods={step.methods}
          onTotp={onTotp}
          onEmailLink={mode === "unlock" ? onEmailLink : undefined}
          onRecover={() => resetTo("recover")}
          onBack={() => resetTo("unlock")}
        />
      )
      break
    case "emailSent":
      description = "Almost there."
      body = <EmailSentStep to={step.to} onBack={() => resetTo("unlock")} />
      break
    case "secretKey":
      description = "One more key for this device."
      body = (
        <SecretKeyStep
          {...busyProps}
          reason={step.reason}
          onSubmit={onSecretKey}
          onEmailLink={
            mode === "unlock" && step.downloaded.meta.account.emailUnlock ? onEmailLink : undefined
          }
          onRecover={() => resetTo("recover")}
          onBack={() => resetTo("unlock")}
        />
      )
      break
    case "rollback":
      title = "Possible rollback"
      description = "The vault on the server is older than expected."
      body = (
        <RollbackStep
          message={step.message}
          busy={busy}
          onContinue={onRollbackContinue}
          onCancel={() => resetTo("unlock")}
        />
      )
      break
    case "recoveryRekey":
      title = "Set a new master password"
      description = `Vault “${step.session.name}”.`
      body = (
        <RecoveryRekeyStep {...busyProps} vaultName={step.session.name} onSubmit={onRecoveryRekey} />
      )
      break
    case "kit":
      title = "Your Emergency Kit"
      description = `Vault “${step.kit.vault}”.`
      body = <EmergencyKitView kit={step.kit} onDone={() => finish(step.session)} doneLabel="Open vault" />
      break
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-4">
      <AppBackdrop priority />
      <Card className="relative w-full max-w-sm border-white/25 bg-card/90 shadow-2xl backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
      <a
        href={APP_BG_CREDIT_HREF}
        className="absolute right-3 bottom-3 text-xs text-white/70 underline-offset-2 hover:text-white hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        {APP_BG_CREDIT_LABEL}
      </a>
    </main>
  )
}
