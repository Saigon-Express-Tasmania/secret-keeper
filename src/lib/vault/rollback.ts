/**
 * Rollback / substitution detection on trusted devices (security audit F4).
 * The server already enforces rev = previous + 1, but someone with direct
 * bucket access could put an older copy back; a device that has seen a newer
 * revision notices.
 */

import type { DeviceRecord } from "@/lib/device/deviceStore"
import type { Ckv3Header } from "@/shared/ckv3"

export type RollbackCheck =
  | { kind: "ok" }
  | { kind: "older"; seen: number; got: number }
  | { kind: "different-vault" }

export function checkRollback(
  device: DeviceRecord | null,
  header: Pick<Ckv3Header, "vaultId" | "rev">
): RollbackCheck {
  if (!device) return { kind: "ok" }
  if (device.vid !== header.vaultId) return { kind: "different-vault" }
  if (header.rev < device.rev) return { kind: "older", seen: device.rev, got: header.rev }
  return { kind: "ok" }
}

export function describeRollback(check: Exclude<RollbackCheck, { kind: "ok" }>): string {
  return check.kind === "older"
    ? `The server returned an older copy of this vault (revision ${check.got}; this device has seen ${check.seen}). Someone may have restored a backup or tampered with storage.`
    : "The vault on the server is not the one this device knows (its identity changed). It may have been recreated or replaced."
}
