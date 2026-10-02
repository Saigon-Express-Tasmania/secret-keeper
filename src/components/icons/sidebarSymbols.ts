import {
  Briefcase,
  Cloud,
  Code,
  CreditCard,
  Database,
  Folder,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  House,
  KeyRound,
  Landmark,
  LockKeyhole,
  Mail,
  MessageCircle,
  Music,
  NotebookPen,
  PiggyBank,
  Plane,
  Shield,
  ShoppingCart,
  Smartphone,
  Star,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { customGlyphId } from "@/lib/finder/icons"
import type { FsNode } from "@/lib/vault/fs"

/** Seed-folder icons get exact symbols; others are matched by keyword. */
const EXACT: Record<string, LucideIcon> = {
  "fluent-color:lock-closed-16": LockKeyhole,
  "fluent-color:shield-16": Shield,
  "fluent-color:savings-16": PiggyBank,
  "fluent-color:notebook-16": NotebookPen,
}

const KEYWORDS: [RegExp, LucideIcon][] = [
  [/lock|password/, LockKeyhole],
  [/shield|secur|protect|guard/, Shield],
  [/key/, KeyRound],
  [/saving|piggy/, PiggyBank],
  [/wallet|money|coin|cash|bitcoin/, Wallet],
  [/card|payment|credit/, CreditCard],
  [/bank|government|landmark/, Landmark],
  [/note|book|journal/, NotebookPen],
  [/mail|letter|inbox/, Mail],
  [/chat|message|comment/, MessageCircle],
  [/people|person|team|user|contact/, Users],
  [/briefcase|work|office|building/, Briefcase],
  [/home|house/, House],
  [/cart|shop|store|bag/, ShoppingCart],
  [/game/, Gamepad2],
  [/cloud/, Cloud],
  [/code|terminal|git|dev/, Code],
  [/database|server|storage/, Database],
  [/phone|mobile/, Smartphone],
  [/globe|web|world|earth/, Globe],
  [/heart|health/, Heart],
  [/star|favorite/, Star],
  [/music|audio/, Music],
  [/plane|travel|airplane/, Plane],
  [/school|education|graduat|hat/, GraduationCap],
]

/** Monochrome sidebar symbol (sidebar icons are tinted, Iconify ones can't be). */
export function sidebarSymbolFor(node: FsNode, name: string): LucideIcon {
  const id = customGlyphId(node, name)
  if (!id) return Folder
  const exact = EXACT[id]
  if (exact) return exact
  const lower = id.toLowerCase()
  for (const [pattern, icon] of KEYWORDS) {
    if (pattern.test(lower)) return icon
  }
  return Folder
}
