import { useState, type ReactNode } from "react"
import { Check, Copy, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react"

import { useFinder } from "@/components/dashboard/finderContext"
import { glyphFor, iconKind } from "@/components/dashboard/views/itemDisplay"
import { FinderIcon } from "@/components/icons/FinderIcon"
import { Button } from "@/components/ui/button"
import { useNow } from "@/hooks/useNow"
import type { AccountEntry } from "@/lib/account/schema"
import {
  formatFinderDate,
  formatFinderSize,
  formatItemCount,
} from "@/lib/finder/format"
import { childCount, finderKind, nodeSizeBytes } from "@/lib/finder/items"
import type { FinderItem } from "@/lib/finder/types"
import { generateOtpCode } from "@/lib/otp/otp"
import { cn } from "@/lib/utils"

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function CopyIcon({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy"}
      title={copied ? "Copied" : "Copy"}
      onClick={() =>
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          })
          .catch(() => {})
      }
      className="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-mac-label-2 hover:bg-mac-hover hover:text-mac-label [&_svg]:size-3.5"
    >
      {copied ? <Check /> : <Copy />}
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2 border-b border-mac-separator py-1 last:border-b-0">
      <span className="w-24 shrink-0 text-[11px] text-mac-label-2">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1 text-[13px] text-mac-label">{children}</span>
    </div>
  )
}

function PasswordValue({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{revealed ? value : "••••••••••"}</span>
      <button
        type="button"
        aria-label={revealed ? "Hide password" : "Reveal password"}
        onClick={() => setRevealed((v) => !v)}
        className="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-mac-label-2 hover:bg-mac-hover hover:text-mac-label [&_svg]:size-3.5"
      >
        {revealed ? <EyeOff /> : <Eye />}
      </button>
      <CopyIcon value={value} />
    </>
  )
}

function OtpValue({ otp }: { otp: NonNullable<AccountEntry["otp"]> }) {
  const now = useNow(1000)
  const result = generateOtpCode(otp, now)
  if (!result.ok) return <span className="text-mac-label-3">--</span>
  return (
    <>
      <span className="font-mono text-[15px] tracking-[0.15em] tabular-nums">
        {result.code.replace(/^(\d{3})(\d+)$/, "$1 $2")}
      </span>
      {result.remaining !== null ? (
        <span className="text-[11px] text-mac-label-3 tabular-nums">{result.remaining}s</span>
      ) : null}
      <span className="flex-1" />
      <CopyIcon value={result.code} />
    </>
  )
}

function AccountFields({ account }: { account: AccountEntry }) {
  return (
    <div className="rounded-[10px] bg-black/[0.035] px-3 dark:bg-white/[0.05]">
      {account.title ? <Field label="Title">{account.title}</Field> : null}
      <Field label="Username">
        {account.username ? (
          <>
            <span className="min-w-0 flex-1 truncate">{account.username}</span>
            <CopyIcon value={account.username} />
          </>
        ) : (
          <span className="text-mac-label-3">--</span>
        )}
      </Field>
      <Field label="Password">
        {account.password ? <PasswordValue value={account.password} /> : <span className="text-mac-label-3">--</span>}
      </Field>
      {account.otp ? (
        <Field label="One-Time Code">
          <OtpValue otp={account.otp} />
        </Field>
      ) : null}
      {account.url ? (
        <Field label="Website">
          {isHttpUrl(account.url) ? (
            <a
              href={account.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 items-center gap-1 text-mac-accent hover:underline"
            >
              <span className="truncate">{account.url}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : (
            <span className="truncate">{account.url}</span>
          )}
        </Field>
      ) : null}
    </div>
  )
}

/**
 * Big icon, name, kind/size, dates and — for account files with Show
 * Credentials on — the decrypted login details. Shared by Quick Look and the
 * Column view preview.
 */
export function ItemPreview({
  item,
  variant,
}: {
  item: FinderItem
  variant: "quicklook" | "column"
}) {
  const c = useFinder()
  const isAccount = item.kind === "file"
  const state = item.source === "vault" ? c.credentials.get(item.path) : undefined
  const bytes = nodeSizeBytes(item.node)
  const iconSize = variant === "column" ? 96 : 112

  let body: ReactNode = null
  if (isAccount && item.source === "trash") {
    body = (
      <p className="text-center text-[12px] text-mac-label-2">
        Put this item back to preview its contents.
      </p>
    )
  } else if (isAccount && !c.showCredentials) {
    body = (
      <div className="flex flex-col items-center gap-2 text-center text-[12px] text-mac-label-2">
        <p>Credentials are hidden. Contents are only decrypted when you choose to show them.</p>
        <Button size="sm" variant="outline" onClick={() => c.setShowCredentials(true)}>
          Show Credentials
        </Button>
      </div>
    )
  } else if (isAccount && (!state || state.status === "loading" || state.status === "idle")) {
    body = (
      <p className="flex items-center justify-center gap-2 text-[12px] text-mac-label-2">
        <Loader2 className="size-3.5 animate-spin" />
        Decrypting…
      </p>
    )
  } else if (isAccount && state?.status === "error") {
    body = <p className="text-center text-[12px] text-mac-red">This item couldn’t be decrypted.</p>
  } else if (isAccount && state?.status === "ready") {
    body = <AccountFields account={state.account} />
  }

  return (
    <div className={cn("flex flex-col gap-4", variant === "column" && "px-4 py-6")}>
      <div className="flex flex-col items-center gap-2 text-center">
        <FinderIcon kind={iconKind(item)} glyphId={glyphFor(item)} size={iconSize} />
        <div className="max-w-full">
          <p className="truncate text-[13px] font-semibold text-mac-label">{item.name}</p>
          <p className="text-[11px] text-mac-label-2">
            {finderKind(item.node)} –{" "}
            {item.kind === "dir" ? formatItemCount(childCount(item.node)) : formatFinderSize(bytes)}
          </p>
        </div>
      </div>
      {body}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-mac-label-2">Created</dt>
        <dd className="text-right text-mac-label">{formatFinderDate(item.node.createdAt)}</dd>
        <dt className="text-mac-label-2">Modified</dt>
        <dd className="text-right text-mac-label">{formatFinderDate(item.node.modifiedAt)}</dd>
        {item.deletedAt ? (
          <>
            <dt className="text-mac-label-2">Deleted</dt>
            <dd className="text-right text-mac-label">{formatFinderDate(item.deletedAt)}</dd>
          </>
        ) : null}
      </dl>
      {variant === "column" && item.source === "vault" ? (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" onClick={() => void c.openItem(item)}>
            Open
          </Button>
        </div>
      ) : null}
    </div>
  )
}
