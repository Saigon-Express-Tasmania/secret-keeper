import {
  OtpCell,
  PasswordCell,
  UsernameCell,
} from "@/components/dashboard/cells/CredentialCells"
import type { ListedAccountState } from "@/components/dashboard/useListedAccounts"
import type { ListColumn } from "@/components/dashboard/views/listColumns"
import type { FinderItem } from "@/lib/finder/types"

const isAccount = (item: FinderItem) => item.source === "vault" && item.kind === "file"

/** Username / Password / One-Time Code columns shown with Show Credentials. */
export function credentialColumns(
  credentials: ReadonlyMap<string, ListedAccountState>
): ListColumn[] {
  return [
    {
      id: "username",
      label: "Username",
      width: 150,
      priority: 1,
      render: (item, ctx) =>
        isAccount(item) ? (
          <UsernameCell state={credentials.get(item.path)} inverted={ctx.selected && ctx.emphasized} />
        ) : null,
    },
    {
      id: "password",
      label: "Password",
      width: 150,
      priority: 2,
      render: (item, ctx) =>
        isAccount(item) ? (
          <PasswordCell state={credentials.get(item.path)} inverted={ctx.selected && ctx.emphasized} />
        ) : null,
    },
    {
      id: "otp",
      label: "One-Time Code",
      width: 128,
      priority: 3,
      render: (item, ctx) =>
        isAccount(item) ? (
          <OtpCell state={credentials.get(item.path)} inverted={ctx.selected && ctx.emphasized} />
        ) : null,
    },
  ]
}
