import { useState } from "react"
import { Download, KeyRound, ShieldAlert } from "lucide-react"

import { CopyButton } from "@/components/editor/CopyButton"
import { Button } from "@/components/ui/button"
import type { EmergencyKit } from "@/lib/vault/vaultSession"

function kitText(kit: EmergencyKit): string {
  const site = typeof location === "undefined" ? "" : location.origin
  return [
    "Credentials Keep — Emergency Kit",
    "",
    `Vault:        ${kit.vault}`,
    `Site:         ${site}`,
    `Created:      ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Secret Key:   ${kit.secretKey}`,
    ...(kit.recoveryKey ? [`Recovery Key: ${kit.recoveryKey}`] : []),
    "",
    "Master password: ______________________________",
    "",
    "- New device: vault name + master password + Secret Key.",
    "- Forgot the password or lost every second factor: the Recovery Key alone",
    "  opens the vault (you must then set a new password). Keep this sheet offline.",
  ].join("\n")
}

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type EmergencyKitViewProps = {
  kit: EmergencyKit
  onDone: () => void
  doneLabel?: string
}

/** Shows new keys once; continuing requires confirming they were saved. */
export function EmergencyKitView({ kit, onDone, doneLabel = "Continue" }: EmergencyKitViewProps) {
  const [saved, setSaved] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          Save these keys now — they are shown only this once. Print the kit or store it
          offline. Anyone with the Recovery Key can open your vault.
        </p>
      </div>
      <KeyLine label="Secret Key" value={kit.secretKey} />
      {kit.recoveryKey ? <KeyLine label="Recovery Key" value={kit.recoveryKey} /> : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => downloadText(kitText(kit), `emergency-kit-${kit.vault}.txt`)}
      >
        <Download />
        Download Emergency Kit (.txt)
      </Button>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I saved my Emergency Kit somewhere safe.
      </label>
      <Button type="button" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  )
}

function KeyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <KeyRound className="size-3.5" />
        {label}
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md border bg-muted/50 px-2 py-1.5 font-mono text-xs break-all select-all">
          {value}
        </code>
        <CopyButton value={value} size="icon" />
      </div>
    </div>
  )
}
