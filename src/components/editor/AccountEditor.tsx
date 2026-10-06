import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react"
import {
  ExternalLink,
  KeyRound,
  LifeBuoy,
  Loader2,
  Lock,
  Plus,
  StickyNote,
  Timer,
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
  /** Big icon at the start of the header (e.g. a Change Icon button). */
  avatar?: ReactNode
  /** File details shown under the title and description. */
  details?: ReactNode
  /** Notified whenever the unsaved-changes state flips (false on unmount). */
  onDirtyChange?: (dirty: boolean) => void
}

/** Header title / description: plain text until hovered or focused. */
const HEADER_INPUT =
  "w-full min-w-0 rounded-[6px] bg-transparent px-1.5 text-center outline-none transition-colors placeholder:font-normal placeholder:text-mac-label-3 hover:bg-mac-hover focus:bg-mac-field focus:ring-[3px] focus:ring-mac-focus @xl:text-left"

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
  avatar,
  details,
  onDirtyChange,
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

  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  }, [onDirtyChange])
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty)
  }, [dirty])
  useEffect(() => () => onDirtyChangeRef.current?.(false), [])

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
  const hasRecovery =
    !!baseline.recoveryEmail.trim() || baseline.recoveryKeys.some((k) => !!k.trim())

  return (
    <div className="@container flex min-h-0 flex-1 flex-col bg-mac-page">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-mac-separator bg-mac-content/90 px-3 py-1.5 backdrop-blur-xl">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-mac-label-2">
          <Lock className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Decrypted while open — cleared when you leave this file</span>
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span
            className="text-[11px] text-mac-label-2"
            aria-live="polite"
          >
            {dirty ? "Edited" : "Saved"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!dirty || saving}
            onClick={discard}
          >
            Revert
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>

      {errorText ? (
        <div className="border-b border-mac-red/30 bg-mac-red/10 px-3 py-1.5 text-[12px] text-mac-red">
          {errorText}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-4 py-5 @3xl:px-8 @3xl:py-7">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          {/* Header: big icon, then the title and description edited in place. */}
          <header className="flex flex-col items-center gap-4 @xl:flex-row @xl:gap-5">
            {avatar}
            <div className="flex w-full min-w-0 flex-1 flex-col gap-0.5">
              <input
                aria-label="Title"
                value={entry.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Add a title"
                autoComplete="off"
                className={cn(HEADER_INPUT, "h-9 text-[22px] font-bold text-mac-label")}
              />
              <input
                aria-label="Description"
                value={entry.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Add a description"
                autoComplete="off"
                className={cn(HEADER_INPUT, "h-6 text-[13px] text-mac-label-2")}
              />
              {details ? (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-1.5 text-[11px] text-mac-label-2 @xl:justify-start">
                  {details}
                </div>
              ) : null}
            </div>
          </header>

          <div className="grid items-start gap-4 @4xl:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-4">
              <EditorSection
                title="Login"
                description="Username, password and website"
                tone="amber"
                icon={KeyRound}
                defaultOpen
              >
                <div className="grid gap-3 @lg:grid-cols-2">
                  <div className="space-y-1">
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
                </div>
                <PasswordGenerator onGenerate={(pw) => patch({ password: pw })} />
                <div className="space-y-1">
                  <Label htmlFor="acct-url">Website</Label>
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
                title="Recovery"
                description="Recovery email and backup codes"
                tone="emerald"
                icon={LifeBuoy}
                defaultOpen={hasRecovery}
              >
                <div className="space-y-1">
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
                    <p className="text-[12px] text-mac-label-2">
                      No recovery keys yet. Add backup codes from the service.
                    </p>
                  ) : (
                    <ul className="grid gap-2 @lg:grid-cols-2">
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
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <EditorSection
                title="Authenticator"
                description="TOTP / HOTP generation"
                tone="violet"
                icon={Timer}
                defaultOpen
              >
                <OtpPanel
                  otp={entry.otp}
                  onChange={(otp) => patch({ otp })}
                  onHotpNext={handleHotpNext}
                  hotpBusy={hotpBusy || saving}
                  fallbackIssuer={entry.title}
                  fallbackLabel={entry.username}
                />
              </EditorSection>
            </div>

            {/* Notes span both columns on wide windows. */}
            <div className="min-w-0 @4xl:col-span-2">
              <EditorSection
                title="Notes"
                description="Free-form notes"
                tone="rose"
                icon={StickyNote}
                defaultOpen
              >
                <Textarea
                  id="acct-notes"
                  aria-label="Notes"
                  value={entry.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  placeholder="Anything else worth remembering…"
                  rows={6}
                  className="min-h-36 resize-y"
                />
              </EditorSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
