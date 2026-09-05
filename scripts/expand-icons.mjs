import fs from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const fluentData = require("@iconify-json/fluent-color/icons.json")
const vscodeData = require("@iconify-json/vscode-icons/icons.json")

const LIMIT = 500

/** @type {Record<string, [string, string]>} base -> [label, group] */
const FLUENT_OVERRIDES = {
  "document-folder": ["Folder", "folders"],
  vault: ["Vault", "folders"],
  database: ["Database", "folders"],
  cloud: ["Cloud", "folders"],
  library: ["Library", "folders"],
  briefcase: ["Briefcase", "folders"],
  building: ["Building", "folders"],
  "building-home": ["Home building", "folders"],
  "building-store": ["Store", "folders"],
  toolbox: ["Toolbox", "folders"],
  apps: ["Apps", "folders"],
  table: ["Table", "folders"],
  document: ["Document", "files"],
  "document-text": ["Text document", "files"],
  "document-edit": ["Editable doc", "files"],
  "document-lock": ["Locked doc", "files"],
  "document-add": ["New document", "files"],
  code: ["Code", "files"],
  "code-block": ["Code block", "files"],
  clipboard: ["Clipboard", "files"],
  "clipboard-task": ["Task list", "files"],
  notebook: ["Notebook", "files"],
  book: ["Book", "files"],
  "book-open": ["Open book", "files"],
  "book-contacts": ["Contacts book", "files"],
  "book-database": ["Data book", "files"],
  drafts: ["Drafts", "files"],
  news: ["News", "files"],
  receipt: ["Receipt", "files"],
  certificate: ["Certificate", "files"],
  "text-bullet-list-square": ["Bullet list", "files"],
  edit: ["Edit", "files"],
  "lock-closed": ["Lock", "security"],
  "lock-shield": ["Lock shield", "security"],
  shield: ["Shield", "security"],
  "shield-checkmark": ["Verified shield", "security"],
  "globe-shield": ["Globe shield", "security"],
  "person-key": ["Person key", "security"],
  "scan-person": ["Scan person", "security"],
  "approvals-app": ["Approvals", "security"],
  person: ["Person", "people"],
  people: ["People", "people"],
  "people-team": ["Team", "people"],
  "people-community": ["Community", "people"],
  "people-home": ["People home", "people"],
  "people-list": ["People list", "people"],
  "contact-card": ["Contact card", "people"],
  guest: ["Guest", "people"],
  org: ["Organization", "people"],
  "person-available": ["Available", "people"],
  mail: ["Mail", "communication"],
  "mail-alert": ["Mail alert", "communication"],
  "mail-multiple": ["Multiple mail", "communication"],
  chat: ["Chat", "communication"],
  "chat-multiple": ["Group chat", "communication"],
  comment: ["Comment", "communication"],
  send: ["Send", "communication"],
  phone: ["Phone", "communication"],
  video: ["Video", "communication"],
  mic: ["Microphone", "communication"],
  headset: ["Headset", "communication"],
  savings: ["Savings", "work"],
  "coin-multiple": ["Coins", "work"],
  calendar: ["Calendar", "work"],
  "calendar-clock": ["Schedule", "work"],
  shifts: ["Shifts", "work"],
  "chart-multiple": ["Charts", "work"],
  "data-trending": ["Trending", "work"],
  poll: ["Poll", "work"],
  settings: ["Settings", "work"],
  options: ["Options", "work"],
  wrench: ["Wrench", "work"],
  laptop: ["Laptop", "work"],
  "phone-laptop": ["Devices", "work"],
  star: ["Star", "status"],
  bookmark: ["Bookmark", "status"],
  flag: ["Flag", "status"],
  pin: ["Pin", "status"],
  heart: ["Heart", "status"],
  warning: ["Warning", "status"],
  "error-circle": ["Error", "status"],
  "checkmark-circle": ["Checkmark", "status"],
  alert: ["Alert", "status"],
  "question-circle": ["Help", "status"],
  premium: ["Premium", "status"],
  ribbon: ["Ribbon", "status"],
  trophy: ["Trophy", "status"],
  home: ["Home", "misc"],
  globe: ["Globe", "misc"],
  image: ["Image", "misc"],
  camera: ["Camera", "misc"],
  lightbulb: ["Idea", "misc"],
  gift: ["Gift", "misc"],
  "puzzle-piece": ["Puzzle", "misc"],
  bot: ["Bot", "misc"],
  history: ["History", "misc"],
  clock: ["Clock", "misc"],
  "location-ripple": ["Location", "misc"],
  wifi: ["Wi-Fi", "misc"],
  "link-multiple": ["Links", "misc"],
  pdf2: ["PDF", "fileTypes"],
}

const EXTRA_LABELS = {
  reactjs: "React",
  reactts: "React TS",
  dartlang: "Dart",
  editorconfig: "EditorConfig",
  powershell: "PowerShell",
  cpp: "C++",
  csharp: "C#",
  js: "JavaScript",
  typescript: "TypeScript",
  "json-official": "JSON (official)",
  "yaml-official": "YAML (official)",
  "typescript-official": "TypeScript (official)",
  "js-official": "JavaScript (official)",
  bat: "Batch",
  dotenv: "Dotenv",
  ovpn: "OpenVPN",
  graphql: "GraphQL",
  protobuf: "Protobuf",
  sqlite: "SQLite",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongo: "MongoDB",
  wasm: "WebAssembly",
}

const FILE_TYPE_PRIORITY = [
  "cert",
  "key",
  "gpg",
  "ovpn",
  "dotenv",
  "config",
  "ini",
  "json",
  "yaml",
  "xml",
  "toml",
  "sql",
  "sqlite",
  "mysql",
  "postgres",
  "mongo",
  "db",
  "access",
  "markdown",
  "mdx",
  "text",
  "log",
  "license",
  "binary",
  "zip",
  "pdf2",
  "excel",
  "word",
  "powerpoint",
  "onenote",
  "outlook",
  "image",
  "svg",
  "webp",
  "video",
  "audio",
  "font",
  "html",
  "css",
  "js",
  "typescript",
  "json-schema",
  "http",
  "swagger",
  "graphql",
  "protobuf",
  "python",
  "rust",
  "go",
  "java",
  "csharp",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "dartlang",
  "flutter",
  "docker",
  "nginx",
  "terraform",
  "ansible",
  "helm",
  "aws",
  "azure",
  "gcloud",
  "git",
  "gitlab",
  "npm",
  "node",
  "bun",
  "yarn",
  "pnpm",
  "reactjs",
  "reactts",
  "vue",
  "svelte",
  "angular",
  "next",
  "nuxt",
  "shell",
  "powershell",
  "bat",
  "postman",
  "bruno",
  "firebase",
  "prisma",
  "editorconfig",
  "host",
  "robots",
  "rss",
  "wasm",
  "cpp",
  "c",
  "scala",
  "elixir",
  "haskell",
  "lua",
  "perl",
  "matlab",
  "jupyter",
  "diff",
  "todo",
  "vite",
  "webpack",
  "eslint",
  "prettier",
  "vscode",
  "godot",
  "blender",
  "sketch",
  "photoshop",
  "json-official",
  "yaml-official",
  "typescript-official",
  "js-official",
  "csv",
  "parquet",
  "avro",
  "redis",
  "neo4j",
  "mariadb",
  "pgsql",
  "plsql",
  "lock",
  "secret",
  "jwt",
  "pem",
  "ssh",
]

const ACRONYMS = new Set([
  "ai",
  "api",
  "aws",
  "cli",
  "css",
  "csv",
  "db",
  "env",
  "git",
  "go",
  "gpg",
  "html",
  "http",
  "id",
  "ini",
  "ios",
  "js",
  "json",
  "jwt",
  "mdx",
  "npm",
  "os",
  "pdf",
  "php",
  "png",
  "rss",
  "sql",
  "ssh",
  "svg",
  "toml",
  "ts",
  "ui",
  "url",
  "vpn",
  "wasm",
  "xml",
  "yaml",
  "yml",
  "zip",
  "csv",
  "pdf",
  "sql",
  "svg",
  "aws",
  "gcp",
  "ios",
  "sql",
])

function fluentBase(name) {
  const m = name.match(/^(.*)-(16|20|24|28|32|48)$/)
  return m ? m[1] : name
}

function pickFluentName(base, available) {
  for (const size of [16, 20, 24, 28, 32, 48]) {
    const name = `${base}-${size}`
    if (available.has(name)) return name
  }
  return available.has(base) ? base : null
}

function titleCase(raw) {
  return raw
    .split("-")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (ACRONYMS.has(lower)) return lower.toUpperCase()
      if (/^\d+$/.test(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}

function labelFor(baseOrName) {
  const base = fluentBase(baseOrName)
  const stripped = base.replace(/^(folder-type-|file-type-|default-)/, "")
  if (FLUENT_OVERRIDES[base]?.[0]) return FLUENT_OVERRIDES[base][0]
  if (FLUENT_OVERRIDES[stripped]?.[0]) return FLUENT_OVERRIDES[stripped][0]
  if (EXTRA_LABELS[base]) return EXTRA_LABELS[base]
  if (EXTRA_LABELS[stripped]) return EXTRA_LABELS[stripped]
  return titleCase(stripped)
}

function groupFluent(base) {
  if (FLUENT_OVERRIDES[base]?.[1]) return FLUENT_OVERRIDES[base][1]
  if (
    /^(lock-|lock$|shield|person-key|scan-person|approvals|globe-shield)/.test(
      base
    )
  ) {
    return "security"
  }
  if (
    /person|people|guest|^org$|contact-card|diversity|patient|checkbox-person|layer-diagonal/.test(
      base
    )
  ) {
    return "people"
  }
  if (
    /^(mail|chat|comment|send|video|^mic$|headset|headphones|megaphone|share-|game-chat)|^phone$/.test(
      base
    )
  ) {
    return "communication"
  }
  if (
    /savings|coin|calendar|shifts|chart|data-|poll|settings|options|wrench|laptop|phone-laptop|gauge|^form$|arrow-trending/.test(
      base
    )
  ) {
    return "work"
  }
  if (
    /folder|library|^vault$|database|^cloud|briefcase|building|toolbox|^apps$|apps-list|^table$|^board$|content-view/.test(
      base
    )
  ) {
    return "folders"
  }
  if (
    /document|^code$|code-block|clipboard|notebook|^book|drafts|^news$|receipt|certificate|text-|edit|scan-type|number-symbol|slide-text|^list-bar$/.test(
      base
    )
  ) {
    return "files"
  }
  if (
    /star|bookmark|^flag$|^pin$|heart|warning|error-circle|checkmark|alert|question-circle|premium|ribbon|trophy|reward|checkbox|dismiss-circle|add-circle/.test(
      base
    )
  ) {
    return "status"
  }
  return "misc"
}

const fluentAvailable = new Set(Object.keys(fluentData.icons))
const fluentBases = new Map()
for (const name of fluentAvailable) {
  const base = fluentBase(name)
  const sizeMatch = name.match(/-(\d+)$/)
  const size = sizeMatch ? Number(sizeMatch[1]) : 999
  const prev = fluentBases.get(base)
  if (!prev || size < prev.size) fluentBases.set(base, { name, size })
}

/** @type {{ prefix: string, name: string, label: string, group: string }[]} */
const catalog = []
const fluentNames = []

for (const base of [...fluentBases.keys()].sort()) {
  const name = pickFluentName(base, fluentAvailable)
  if (!name) throw new Error(`missing fluent ${base}`)
  fluentNames.push(name)
  catalog.push({
    prefix: "fluent-color",
    name,
    label: labelFor(base),
    group: groupFluent(base),
  })
}

const vscodeAvailable = new Set(Object.keys(vscodeData.icons))

function addVscode(name, group) {
  if (!vscodeAvailable.has(name)) return false
  if (catalog.some((c) => c.prefix === "vscode-icons" && c.name === name)) {
    return false
  }
  catalog.push({
    prefix: "vscode-icons",
    name,
    label: labelFor(name),
    group,
  })
  return true
}

addVscode("default-folder", "folderTypes")
addVscode("default-file", "fileTypes")

const folderTypes = [...vscodeAvailable]
  .filter((n) => n.startsWith("folder-type-") && !n.endsWith("-opened"))
  .sort()
for (const name of folderTypes) addVscode(name, "folderTypes")

const fileTypeSet = new Set(
  [...vscodeAvailable]
    .filter((n) => n.startsWith("file-type-"))
    .map((n) => n.slice("file-type-".length))
)

function addFileType(shortName) {
  if (catalog.length >= LIMIT) return false
  const name = `file-type-${shortName}`
  if (!fileTypeSet.has(shortName)) return false
  return addVscode(name, "fileTypes")
}

for (const shortName of FILE_TYPE_PRIORITY) addFileType(shortName)

const remainingFileTypes = [...fileTypeSet]
  .filter((n) => !n.startsWith("light-") && !/\d$/.test(n))
  .sort()
for (const shortName of remainingFileTypes) {
  if (catalog.length >= LIMIT) break
  addFileType(shortName)
}

if (catalog.length > LIMIT) catalog.length = LIMIT

function subset(data, names) {
  const icons = {}
  for (const name of names) {
    const icon = data.icons[name]
    if (!icon) throw new Error(`missing icon data ${name}`)
    icons[name] = icon
  }
  const out = { prefix: data.prefix, icons }
  if (data.width) out.width = data.width
  if (data.height) out.height = data.height
  return out
}

const fluentOutNames = catalog
  .filter((c) => c.prefix === "fluent-color")
  .map((c) => c.name)
const vscodeOutNames = catalog
  .filter((c) => c.prefix === "vscode-icons")
  .map((c) => c.name)

fs.writeFileSync(
  "src/lib/icons/fluent-color.json",
  JSON.stringify(subset(fluentData, fluentOutNames))
)
fs.writeFileSync(
  "src/lib/icons/vscode-icons.json",
  JSON.stringify(subset(vscodeData, vscodeOutNames))
)

const entries = catalog
  .map(
    (c) =>
      `  { id: idOf(${JSON.stringify(c.prefix)}, ${JSON.stringify(c.name)}), name: ${JSON.stringify(c.name)}, label: ${JSON.stringify(c.label)}, group: ${JSON.stringify(c.group)} },`
  )
  .join("\n")

const ts = `/**
 * Curated Fluent UI System Color Icons (MIT, Microsoft) plus VSCode Icons (MIT).
 * Full sets via Iconify:
 * - https://icon-sets.iconify.design/fluent-color/
 * - https://icon-sets.iconify.design/vscode-icons/
 *
 * Icons are vendored offline so the vault app never fetches from Iconify CDN.
 * Regenerated by \`node scripts/expand-icons.mjs\`.
 */

import { addCollection } from "@iconify/react"

import fluentColorData from "@/lib/icons/fluent-color.json"
import vscodeIconsData from "@/lib/icons/vscode-icons.json"
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
  | "folderTypes"
  | "fileTypes"

export type CatalogIcon = {
  /** Full id: \`fluent-color:document-16\` or \`vscode-icons:file-type-json\` */
  id: string
  /** Iconify name within the collection (without prefix). */
  name: string
  label: string
  group: IconGroupId
}

function idOf(prefix: string, name: string): string {
  return \`\${prefix}:\${name}\`
}

/** Picker catalog — names must exist in the vendored JSON files. */
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
  folderTypes: "Folder types",
  fileTypes: "File types",
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
  "folderTypes",
  "fileTypes",
]

const catalogIds = new Set(ICON_CATALOG.map((i) => i.id))

/** Register vendored icon collections with Iconify (call once at startup). */
export function registerFluentColorIcons(): void {
  addCollection(fluentColorData as Parameters<typeof addCollection>[0])
  addCollection(vscodeIconsData as Parameters<typeof addCollection>[0])
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

const fluentKb = (
  fs.statSync("src/lib/icons/fluent-color.json").size / 1024
).toFixed(1)
const vscodeKb = (
  fs.statSync("src/lib/icons/vscode-icons.json").size / 1024
).toFixed(1)
console.log(
  `icons ${catalog.length} (fluent ${fluentOutNames.length}, vscode ${vscodeOutNames.length})`
)
console.log(`fluent-color.json ${fluentKb} KB`)
console.log(`vscode-icons.json ${vscodeKb} KB`)
