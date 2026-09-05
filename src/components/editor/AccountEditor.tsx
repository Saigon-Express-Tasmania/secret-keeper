import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react"
import {
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react"

import { CopyButton } from "@/components/editor/CopyButton"
import { EditorSection } from "@/components/editor/EditorSection"
import { OtpPanel } from "@/components/editor/OtpPanel"
import { PasswordGenerator } from "@/components/editor/PasswordGenerator"
import { SecretField } from "@/components/editor/SecretField"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  accountsEqual,
  parseAccount,
  serializeAccount,
  type AccountEntry,
} from "@/lib/account/schema"
import type { JsonValue } from "@/lib/vault/fs"
import { cn } from "@/lib/utils"

export type AccountEditorHandle = {
  isDirty: () => boolean
  save: () => Promise<boolean>
  discard: () => void
}

type AccountEditorProps = {
  initialJson: JsonValue
  saving: boolean
  saveError: string | null
  onSave: (json: JsonValue) => Promise<void>
  /** Expose dirty/save/discard to Dashboard leave-gate. */
  editorRef?: MutableRefObject<AccountEditorHandle | null>
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

export function AccountEditor({
  initialJson,
  saving,
  saveError,
  onSave,
  editorRef,
}: AccountEditorProps) {
  const parsed = useMemo(() => parseAccount(initialJson), [initialJson])
  const [entry, setEntry] = useState<AccountEntry>(parsed)
  const [baseline, setBaseline] = useState<AccountEntry>(parsed)
  const [hotpBusy, setHotpBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const initialKey = useRef(initialJson)
  useEffect(() => {
    if (initialKey.current !== initialJson) {
      initialKey.current = initialJson
      const next = parseAccount(initialJson)
      setEntry(next)
      setBaseline(next)
      setLocalError(null)
    }
  }, [initialJson])

  const dirty = !accountsEqual(entry, baseline)

  const patch = useCallback((partial: Partial<AccountEntry>) => {
    setEntry((prev) => ({ ...prev, ...partial }))
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    setLocalError(null)
    try {
      const json = serializeAccount(entry)
      await onSave(json)
      const saved = parseAccount(json)
      setEntry(saved)
      setBaseline(saved)
      return true
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to save account."
      )
      return false
    }
  }, [entry, onSave])

  const discard = useCallback(() => {
    setEntry(baseline)
    setLocalError(null)
  }, [baseline])

  useEffect(() => {
    if (!editorRef) return
    editorRef.current = {
      isDirty: () => !accountsEqual(entry, baseline),
      save,
      discard,
    }
    return () => {
      editorRef.current = null
    }
  }, [editorRef, entry, baseline, save, discard])

  async function handleHotpNext() {
    if (!entry.otp || entry.otp.type !== "hotp") return
    const nextEntry: AccountEntry = {
      ...entry,
      otp: { ...entry.otp, counter: entry.otp.counter + 1 },
    }
    setEntry(nextEntry)
    setHotpBusy(true)
    setLocalError(null)
    try {
      const json = serializeAccount(nextEntry)
      await onSave(json)
      const saved = parseAccount(json)
      setEntry(saved)
      setBaseline(saved)
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to save HOTP counter."
      )
    } finally {
      setHotpBusy(false)
    }
  }

  function updateRecoveryKey(index: number, value: string) {
    const keys = [...entry.recoveryKeys]
    keys[index] = value
    patch({ recoveryKeys: keys })
  }

  function removeRecoveryKey(index: number) {
    patch({
      recoveryKeys: entry.recoveryKeys.filter((_, i) => i !== index),
    })
  }

  function addRecoveryKey() {
    patch({ recoveryKeys: [...entry.recoveryKeys, ""] })
  }

  const errorText = localError ?? saveError
  const canOpenUrl = isHttpUrl(entry.url)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-emerald-200/70 bg-gradient-to-r from-emerald-50/95 to-sky-50/90 px-4 py-2 backdrop-blur">
        <span
          className={cn(
            "text-xs font-medium",
            dirty
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400"
          )}
        >
          {dirty ? "Unsaved changes" : "Saved"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!dirty || saving}
            onClick={discard}
          >
            <RotateCcw />
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save
          </Button>
        </div>
      </div>

      {errorText ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {errorText}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <EditorSection
          title="Account"
          description="Title, description, and service URL"
          tone="sky"
          defaultOpen
        >
          <div className="space-y-1.5">
            <Label htmlFor="acct-title">Title</Label>
            <Input
              id="acct-title"
              value={entry.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="GitHub"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-desc">Description</Label>
            <Input
              id="acct-desc"
              value={entry.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Work account"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-url">URL</Label>
            <div className="flex gap-2">
              <Input
                id="acct-url"
                value={entry.url}
                onChange={(e) => patch({ url: e.target.value })}
                placeholder="https://github.com/login"
                className="font-mono text-sm"
              />
              <CopyButton value={entry.url} size="icon" />
              {canOpenUrl ? (
                <Button type="button" size="icon" variant="outline" asChild>
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open URL"
                  >
                    <ExternalLink />
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled
                  aria-label="Open URL"
                >
                  <ExternalLink />
                </Button>
              )}
            </div>
          </div>
        </EditorSection>

        <EditorSection
          title="Login"
          description="Username and password"
          tone="amber"
          defaultOpen
        >
          <div className="space-y-1.5">
            <Label htmlFor="acct-user">Username</Label>
            <div className="flex gap-2">
              <Input
                id="acct-user"
                value={entry.username}
                onChange={(e) => patch({ username: e.target.value })}
                autoComplete="off"
              />
              <CopyButton value={entry.username} size="icon" />
            </div>
          </div>
          <SecretField
            id="acct-pass"
            label="Password"
            value={entry.password}
            onChange={(v) => patch({ password: v })}
          />
          <PasswordGenerator onGenerate={(pw) => patch({ password: pw })} />
        </EditorSection>

        <EditorSection
          title="Recovery"
          description="Recovery email and backup codes"
          tone="emerald"
          defaultOpen={false}
        >
          <div className="space-y-1.5">
            <Label htmlFor="acct-recovery-email">Recovery email</Label>
            <div className="flex gap-2">
              <Input
                id="acct-recovery-email"
                type="email"
                value={entry.recoveryEmail}
                onChange={(e) => patch({ recoveryEmail: e.target.value })}
                placeholder="backup@example.com"
              />
              <CopyButton value={entry.recoveryEmail} size="icon" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Recovery keys</Label>
              <div className="flex gap-2">
                <CopyButton
                  value={entry.recoveryKeys.filter(Boolean).join("\n")}
                  label="Copy all"
                  disabled={entry.recoveryKeys.every((k) => !k.trim())}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addRecoveryKey}
                >
                  <Plus />
                  Add
                </Button>
              </div>
            </div>
            {entry.recoveryKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No recovery keys yet. Add backup codes from the service.
              </p>
            ) : (
              <ul className="space-y-2">
                {entry.recoveryKeys.map((key, index) => (
                  <li key={index} className="flex gap-2">
                    <Input
                      value={key}
                      onChange={(e) =>
                        updateRecoveryKey(index, e.target.value)
                      }
                      className="font-mono text-sm"
                      placeholder={`Code ${index + 1}`}
                    />
                    <CopyButton value={key} size="icon" />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => removeRecoveryKey(index)}
                      aria-label="Remove key"
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </EditorSection>

        <EditorSection
          title="Authenticator"
          description="TOTP / HOTP generation"
          tone="violet"
          defaultOpen
        >
          <OtpPanel
            otp={entry.otp}
            onChange={(otp) => patch({ otp })}
            onHotpNext={handleHotpNext}
            hotpBusy={hotpBusy || saving}
          />
        </EditorSection>

        <EditorSection
          title="Notes"
          description="Free-form notes"
          tone="rose"
          defaultOpen={false}
        >
          <Textarea
            id="acct-notes"
            value={entry.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Anything else worth remembering…"
            rows={6}
          />
        </EditorSection>
      </div>
    </div>
  )
}
