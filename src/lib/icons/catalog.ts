/**
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
  /** Full id: `fluent-color:document-16` */
  id: string
  /** Iconify name within the collection (without prefix). */
  name: string
  label: string
  group: IconGroupId
}

const PREFIX = "fluent-color"

function idOf(name: string): string {
  return `${PREFIX}:${name}`
}

/** Picker catalog — names must exist in fluent-color.json. */
export const ICON_CATALOG: CatalogIcon[] = [
  { id: idOf("document-folder-16"), name: "document-folder-16", label: "Folder", group: "folders" },
  { id: idOf("vault-16"), name: "vault-16", label: "Vault", group: "folders" },
  { id: idOf("database-16"), name: "database-16", label: "Database", group: "folders" },
  { id: idOf("cloud-16"), name: "cloud-16", label: "Cloud", group: "folders" },
  { id: idOf("library-16"), name: "library-16", label: "Library", group: "folders" },
  { id: idOf("briefcase-16"), name: "briefcase-16", label: "Briefcase", group: "folders" },
  { id: idOf("building-16"), name: "building-16", label: "Building", group: "folders" },
  { id: idOf("building-home-16"), name: "building-home-16", label: "Home building", group: "folders" },
  { id: idOf("building-store-16"), name: "building-store-16", label: "Store", group: "folders" },
  { id: idOf("toolbox-16"), name: "toolbox-16", label: "Toolbox", group: "folders" },
  { id: idOf("apps-16"), name: "apps-16", label: "Apps", group: "folders" },
  { id: idOf("table-16"), name: "table-16", label: "Table", group: "folders" },
  { id: idOf("document-16"), name: "document-16", label: "Document", group: "files" },
  { id: idOf("document-text-16"), name: "document-text-16", label: "Text document", group: "files" },
  { id: idOf("document-edit-16"), name: "document-edit-16", label: "Editable doc", group: "files" },
  { id: idOf("document-lock-16"), name: "document-lock-16", label: "Locked doc", group: "files" },
  { id: idOf("document-add-16"), name: "document-add-16", label: "New document", group: "files" },
  { id: idOf("code-16"), name: "code-16", label: "Code", group: "files" },
  { id: idOf("code-block-16"), name: "code-block-16", label: "Code block", group: "files" },
  { id: idOf("clipboard-16"), name: "clipboard-16", label: "Clipboard", group: "files" },
  { id: idOf("clipboard-task-16"), name: "clipboard-task-16", label: "Task list", group: "files" },
  { id: idOf("notebook-16"), name: "notebook-16", label: "Notebook", group: "files" },
  { id: idOf("book-16"), name: "book-16", label: "Book", group: "files" },
  { id: idOf("book-open-16"), name: "book-open-16", label: "Open book", group: "files" },
  { id: idOf("book-contacts-16"), name: "book-contacts-16", label: "Contacts book", group: "files" },
  { id: idOf("book-database-16"), name: "book-database-16", label: "Data book", group: "files" },
  { id: idOf("drafts-16"), name: "drafts-16", label: "Drafts", group: "files" },
  { id: idOf("news-16"), name: "news-16", label: "News", group: "files" },
  { id: idOf("receipt-16"), name: "receipt-16", label: "Receipt", group: "files" },
  { id: idOf("certificate-16"), name: "certificate-16", label: "Certificate", group: "files" },
  { id: idOf("text-bullet-list-square-16"), name: "text-bullet-list-square-16", label: "Bullet list", group: "files" },
  { id: idOf("edit-16"), name: "edit-16", label: "Edit", group: "files" },
  { id: idOf("lock-closed-16"), name: "lock-closed-16", label: "Lock", group: "security" },
  { id: idOf("lock-shield-16"), name: "lock-shield-16", label: "Lock shield", group: "security" },
  { id: idOf("shield-16"), name: "shield-16", label: "Shield", group: "security" },
  { id: idOf("shield-checkmark-16"), name: "shield-checkmark-16", label: "Verified shield", group: "security" },
  { id: idOf("globe-shield-20"), name: "globe-shield-20", label: "Globe shield", group: "security" },
  { id: idOf("person-key-20"), name: "person-key-20", label: "Person key", group: "security" },
  { id: idOf("scan-person-16"), name: "scan-person-16", label: "Scan person", group: "security" },
  { id: idOf("approvals-app-16"), name: "approvals-app-16", label: "Approvals", group: "security" },
  { id: idOf("person-16"), name: "person-16", label: "Person", group: "people" },
  { id: idOf("people-16"), name: "people-16", label: "People", group: "people" },
  { id: idOf("people-team-16"), name: "people-team-16", label: "Team", group: "people" },
  { id: idOf("people-community-16"), name: "people-community-16", label: "Community", group: "people" },
  { id: idOf("people-home-16"), name: "people-home-16", label: "People home", group: "people" },
  { id: idOf("people-list-16"), name: "people-list-16", label: "People list", group: "people" },
  { id: idOf("contact-card-16"), name: "contact-card-16", label: "Contact card", group: "people" },
  { id: idOf("guest-16"), name: "guest-16", label: "Guest", group: "people" },
  { id: idOf("org-16"), name: "org-16", label: "Organization", group: "people" },
  { id: idOf("person-available-16"), name: "person-available-16", label: "Available", group: "people" },
  { id: idOf("mail-16"), name: "mail-16", label: "Mail", group: "communication" },
  { id: idOf("mail-alert-16"), name: "mail-alert-16", label: "Mail alert", group: "communication" },
  { id: idOf("mail-multiple-16"), name: "mail-multiple-16", label: "Multiple mail", group: "communication" },
  { id: idOf("chat-16"), name: "chat-16", label: "Chat", group: "communication" },
  { id: idOf("chat-multiple-16"), name: "chat-multiple-16", label: "Group chat", group: "communication" },
  { id: idOf("comment-16"), name: "comment-16", label: "Comment", group: "communication" },
  { id: idOf("send-16"), name: "send-16", label: "Send", group: "communication" },
  { id: idOf("phone-16"), name: "phone-16", label: "Phone", group: "communication" },
  { id: idOf("video-16"), name: "video-16", label: "Video", group: "communication" },
  { id: idOf("mic-16"), name: "mic-16", label: "Microphone", group: "communication" },
  { id: idOf("headset-16"), name: "headset-16", label: "Headset", group: "communication" },
  { id: idOf("savings-16"), name: "savings-16", label: "Savings", group: "work" },
  { id: idOf("coin-multiple-16"), name: "coin-multiple-16", label: "Coins", group: "work" },
  { id: idOf("calendar-16"), name: "calendar-16", label: "Calendar", group: "work" },
  { id: idOf("calendar-clock-16"), name: "calendar-clock-16", label: "Schedule", group: "work" },
  { id: idOf("shifts-16"), name: "shifts-16", label: "Shifts", group: "work" },
  { id: idOf("chart-multiple-16"), name: "chart-multiple-16", label: "Charts", group: "work" },
  { id: idOf("data-trending-16"), name: "data-trending-16", label: "Trending", group: "work" },
  { id: idOf("poll-16"), name: "poll-16", label: "Poll", group: "work" },
  { id: idOf("settings-16"), name: "settings-16", label: "Settings", group: "work" },
  { id: idOf("options-16"), name: "options-16", label: "Options", group: "work" },
  { id: idOf("wrench-16"), name: "wrench-16", label: "Wrench", group: "work" },
  { id: idOf("laptop-16"), name: "laptop-16", label: "Laptop", group: "work" },
  { id: idOf("phone-laptop-16"), name: "phone-laptop-16", label: "Devices", group: "work" },
  { id: idOf("star-16"), name: "star-16", label: "Star", group: "status" },
  { id: idOf("bookmark-16"), name: "bookmark-16", label: "Bookmark", group: "status" },
  { id: idOf("flag-16"), name: "flag-16", label: "Flag", group: "status" },
  { id: idOf("pin-16"), name: "pin-16", label: "Pin", group: "status" },
  { id: idOf("heart-16"), name: "heart-16", label: "Heart", group: "status" },
  { id: idOf("warning-16"), name: "warning-16", label: "Warning", group: "status" },
  { id: idOf("error-circle-16"), name: "error-circle-16", label: "Error", group: "status" },
  { id: idOf("checkmark-circle-16"), name: "checkmark-circle-16", label: "Checkmark", group: "status" },
  { id: idOf("alert-16"), name: "alert-16", label: "Alert", group: "status" },
  { id: idOf("question-circle-16"), name: "question-circle-16", label: "Help", group: "status" },
  { id: idOf("premium-16"), name: "premium-16", label: "Premium", group: "status" },
  { id: idOf("ribbon-16"), name: "ribbon-16", label: "Ribbon", group: "status" },
  { id: idOf("trophy-16"), name: "trophy-16", label: "Trophy", group: "status" },
  { id: idOf("home-16"), name: "home-16", label: "Home", group: "misc" },
  { id: idOf("globe-20"), name: "globe-20", label: "Globe", group: "misc" },
  { id: idOf("image-16"), name: "image-16", label: "Image", group: "misc" },
  { id: idOf("camera-16"), name: "camera-16", label: "Camera", group: "misc" },
  { id: idOf("lightbulb-16"), name: "lightbulb-16", label: "Idea", group: "misc" },
  { id: idOf("gift-16"), name: "gift-16", label: "Gift", group: "misc" },
  { id: idOf("puzzle-piece-16"), name: "puzzle-piece-16", label: "Puzzle", group: "misc" },
  { id: idOf("bot-16"), name: "bot-16", label: "Bot", group: "misc" },
  { id: idOf("history-16"), name: "history-16", label: "History", group: "misc" },
  { id: idOf("clock-16"), name: "clock-16", label: "Clock", group: "misc" },
  { id: idOf("location-ripple-16"), name: "location-ripple-16", label: "Location", group: "misc" },
  { id: idOf("wifi-20"), name: "wifi-20", label: "Wi-Fi", group: "misc" },
  { id: idOf("link-multiple-16"), name: "link-multiple-16", label: "Links", group: "misc" },
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
