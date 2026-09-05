import fs from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const data = require("@iconify-json/fluent-color/icons.json")
const available = new Set(Object.keys(data.icons))

/** @type {[string, string, string][]} */
const picks = [
  ["document-folder", "Folder", "folders"],
  ["vault", "Vault", "folders"],
  ["database", "Database", "folders"],
  ["cloud", "Cloud", "folders"],
  ["library", "Library", "folders"],
  ["briefcase", "Briefcase", "folders"],
  ["building", "Building", "folders"],
  ["building-home", "Home building", "folders"],
  ["building-store", "Store", "folders"],
  ["toolbox", "Toolbox", "folders"],
  ["apps", "Apps", "folders"],
  ["table", "Table", "folders"],
  ["document", "Document", "files"],
  ["document-text", "Text document", "files"],
  ["document-edit", "Editable doc", "files"],
  ["document-lock", "Locked doc", "files"],
  ["document-add", "New document", "files"],
  ["code", "Code", "files"],
  ["code-block", "Code block", "files"],
  ["clipboard", "Clipboard", "files"],
  ["clipboard-task", "Task list", "files"],
  ["notebook", "Notebook", "files"],
  ["book", "Book", "files"],
  ["book-open", "Open book", "files"],
  ["book-contacts", "Contacts book", "files"],
  ["book-database", "Data book", "files"],
  ["drafts", "Drafts", "files"],
  ["news", "News", "files"],
  ["receipt", "Receipt", "files"],
  ["certificate", "Certificate", "files"],
  ["text-bullet-list-square", "Bullet list", "files"],
  ["edit", "Edit", "files"],
  ["lock-closed", "Lock", "security"],
  ["lock-shield", "Lock shield", "security"],
  ["shield", "Shield", "security"],
  ["shield-checkmark", "Verified shield", "security"],
  ["globe-shield", "Globe shield", "security"],
  ["person-key", "Person key", "security"],
  ["scan-person", "Scan person", "security"],
  ["approvals-app", "Approvals", "security"],
  ["person", "Person", "people"],
  ["people", "People", "people"],
  ["people-team", "Team", "people"],
  ["people-community", "Community", "people"],
  ["people-home", "People home", "people"],
  ["people-list", "People list", "people"],
  ["contact-card", "Contact card", "people"],
  ["guest", "Guest", "people"],
  ["org", "Organization", "people"],
  ["person-available", "Available", "people"],
  ["mail", "Mail", "communication"],
  ["mail-alert", "Mail alert", "communication"],
  ["mail-multiple", "Multiple mail", "communication"],
  ["chat", "Chat", "communication"],
  ["chat-multiple", "Group chat", "communication"],
  ["comment", "Comment", "communication"],
  ["send", "Send", "communication"],
  ["phone", "Phone", "communication"],
  ["video", "Video", "communication"],
  ["mic", "Microphone", "communication"],
  ["headset", "Headset", "communication"],
  ["savings", "Savings", "work"],
  ["coin-multiple", "Coins", "work"],
  ["calendar", "Calendar", "work"],
  ["calendar-clock", "Schedule", "work"],
  ["shifts", "Shifts", "work"],
  ["chart-multiple", "Charts", "work"],
  ["data-trending", "Trending", "work"],
  ["poll", "Poll", "work"],
  ["settings", "Settings", "work"],
  ["options", "Options", "work"],
  ["wrench", "Wrench", "work"],
  ["laptop", "Laptop", "work"],
  ["phone-laptop", "Devices", "work"],
  ["star", "Star", "status"],
  ["bookmark", "Bookmark", "status"],
  ["flag", "Flag", "status"],
  ["pin", "Pin", "status"],
  ["heart", "Heart", "status"],
  ["warning", "Warning", "status"],
  ["error-circle", "Error", "status"],
  ["checkmark-circle", "Checkmark", "status"],
  ["alert", "Alert", "status"],
  ["question-circle", "Help", "status"],
  ["premium", "Premium", "status"],
  ["ribbon", "Ribbon", "status"],
  ["trophy", "Trophy", "status"],
  ["home", "Home", "misc"],
  ["globe", "Globe", "misc"],
  ["image", "Image", "misc"],
  ["camera", "Camera", "misc"],
  ["lightbulb", "Idea", "misc"],
  ["gift", "Gift", "misc"],
  ["puzzle-piece", "Puzzle", "misc"],
  ["bot", "Bot", "misc"],
  ["history", "History", "misc"],
  ["clock", "Clock", "misc"],
  ["location-ripple", "Location", "misc"],
  ["wifi", "Wi-Fi", "misc"],
  ["link-multiple", "Links", "misc"],
]

function resolve(base) {
  if (available.has(`${base}-16`)) return `${base}-16`
  if (available.has(`${base}-20`)) return `${base}-20`
  return null
}

const catalog = []
const names = []
for (const [base, label, group] of picks) {
  const name = resolve(base)
  if (!name) throw new Error(`missing ${base}`)
  if (names.includes(name)) continue
  names.push(name)
  catalog.push({ name, label, group })
}

const out = { prefix: "fluent-color", icons: {} }
for (const name of names) out.icons[name] = data.icons[name]
fs.writeFileSync("src/lib/icons/fluent-color.json", JSON.stringify(out))

const entries = catalog
  .map(
    (c) =>
      `  { id: idOf(${JSON.stringify(c.name)}), name: ${JSON.stringify(c.name)}, label: ${JSON.stringify(c.label)}, group: ${JSON.stringify(c.group)} },`
  )
  .join("\n")

const ts = `/**
 * Curated Fluent UI System Color Icons (MIT, Microsoft).
 * Full set via Iconify: https://icon-sets.iconify.design/fluent-color/
 *
 * Other strong MIT packs (not bundled here):
 * - VSCode Icons — https://icon-sets.iconify.design/vscode-icons/
 * - Catppuccin Icons — https://icon-sets.iconify.design/catppuccin-icons/
 *
 * Icons are vendored offline so the vault app never fetches from Iconify CDN.
 */

import { addCollection } from "@iconify/react"

import fluentColorData from "@/lib/icons/fluent-color.json"
import {
  DEFAULT_FILE_ICON,
  DEFAULT_FOLDER_ICON,
} from "@/lib/vault/fs"

export type IconGroupId =
  | "folders"
  | "files"
  | "security"
  | "people"
  | "communication"
  | "work"
  | "status"
  | "misc"

export type CatalogIcon = {
  /** Full id: \`fluent-color:document-16\` */
  id: string
  /** Iconify name within the collection (without prefix). */
  name: string
  label: string
  group: IconGroupId
}

const PREFIX = "fluent-color"

function idOf(name: string): string {
  return \`\${PREFIX}:\${name}\`
}

/** Picker catalog — names must exist in fluent-color.json. */
export const ICON_CATALOG: CatalogIcon[] = [
${entries}
]

export const ICON_GROUP_LABELS: Record<IconGroupId, string> = {
  folders: "Folders",
  files: "Files",
  security: "Security",
  people: "People",
  communication: "Communication",
  work: "Work & money",
  status: "Status",
  misc: "More",
}

export const ICON_GROUP_ORDER: IconGroupId[] = [
  "folders",
  "files",
  "security",
  "people",
  "communication",
  "work",
  "status",
  "misc",
]

const catalogIds = new Set(ICON_CATALOG.map((i) => i.id))

/** Register the vendored Fluent Color subset with Iconify (call once at startup). */
export function registerFluentColorIcons(): void {
  addCollection(fluentColorData as Parameters<typeof addCollection>[0])
}

export function isKnownIconId(id: string | undefined): boolean {
  return typeof id === "string" && catalogIds.has(id)
}

export function defaultIconForKind(kind: "folder" | "file"): string {
  return kind === "folder" ? DEFAULT_FOLDER_ICON : DEFAULT_FILE_ICON
}

/**
 * Icons shown in the picker.
 * Full catalog for both kinds so users can pick any theme icon.
 */
export function iconsForPicker(_kind?: "folder" | "file"): CatalogIcon[] {
  return ICON_CATALOG
}
`

fs.writeFileSync("src/lib/icons/catalog.ts", ts)
for (const f of ["src/lib/icons/_catalog-generated.json"]) {
  try {
    fs.unlinkSync(f)
  } catch {
    /* ignore */
  }
}
console.log(`icons ${catalog.length}`)
console.log(`json ${(fs.statSync("src/lib/icons/fluent-color.json").size / 1024).toFixed(1)} KB`)
