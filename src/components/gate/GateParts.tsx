import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type FieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
  mono?: boolean
  hint?: ReactNode
}

export function Field({ id, label, onChange, hint, mono, ...input }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        autoCapitalize="none"
        spellCheck={false}
        className={mono ? "font-mono" : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...input}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function TrustDeviceCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Trust this device for 30 days
        <span className="block text-xs text-muted-foreground">
          Remembers your Secret Key here and skips the second factor. Don't use on shared
          computers.
        </span>
      </span>
    </label>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  )
}

export function BusyLabel({ label, progress }: { label: string; progress?: number | null }) {
  return (
    <>
      <Loader2 className="animate-spin" />
      {label}
      {progress != null && progress > 0 && progress < 1 ? ` ${Math.round(progress * 100)}%` : ""}
    </>
  )
}

export function LinkButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="text-sm text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
