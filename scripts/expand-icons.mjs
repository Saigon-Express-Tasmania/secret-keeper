import fs from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const fluentData = require("@iconify-json/fluent-color/icons.json")
const vscodeData = require("@iconify-json/vscode-icons/icons.json")
const parkData = require("@iconify-json/icon-park/icons.json")

const LIMIT = 1000

const GENERAL_GROUPS = [
  "security",
  "folders",
  "communication",
  "status",
  "people",
  "work",
  "files",
  "misc",
]

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
  "two-dimensional-code": "QR Code",
  "two-dimensional-code-one": "QR Code 1",
  "two-dimensional-code-two": "QR Code 2",
  "scan-code": "Scan code",
  "electronic-door-lock": "Door lock",
  "electronic-locks-close": "Locks closed",
  "electronic-locks-open": "Locks open",
  "cloud-storage": "Cloud storage",
  "id-card": "ID card",
  "id-card-h": "ID card H",
  "id-card-v": "ID card V",
  ppt: "PowerPoint",
  youtobe: "YouTube",
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

/** Prefer these IconPark names first within each group (skip if missing). */
const PARK_PRIORITY = {
  security: [
    "lock",
    "lock-one",
    "unlock",
    "unlock-one",
    "key",
    "shield",
    "shield-add",
    "protect",
    "protection",
    "security",
    "permissions",
    "strongbox",
    "fingerprint",
    "fingerprint-two",
    "fingerprint-three",
    "personal-privacy",
    "people-safe",
    "people-safe-one",
    "electronic-door-lock",
    "electronic-locks-close",
    "electronic-locks-open",
    "induction-lock",
    "data-lock",
    "database-lock",
    "email-lock",
    "email-security",
    "file-lock",
    "file-lock-one",
    "folder-lock",
    "folder-lock-one",
    "folder-protection",
    "folder-protection-one",
    "two-dimensional-code",
    "two-dimensional-code-one",
    "two-dimensional-code-two",
    "scan-code",
    "insurance",
    "surveillance-cameras",
    "surveillance-cameras-one",
    "surveillance-cameras-two",
    "safe-retrieval",
    "umbrella",
    "umbrella-one",
    "umbrella-two",
    "harm",
    "caution",
    "keyhole",
    "locking-computer",
    "locking-laptop",
    "locking-web",
    "locking-picture",
    "forbid",
    "database-forbid",
    "folder-block",
    "folder-block-one",
    "email-block",
    "inspection",
    "flight-safety",
    "prison",
    "seal",
    "scan",
    "scanning",
    "scanning-two",
  ],
  folders: [
    "folder",
    "folder-close",
    "folder-open",
    "folder-one",
    "folder-plus",
    "folder-minus",
    "folder-success",
    "folder-failed",
    "folder-search",
    "folder-settings",
    "folder-upload",
    "folder-download",
    "folder-code",
    "folder-focus",
    "folder-quality",
    "folder-music",
    "folder-conversion",
    "folder-withdrawal",
    "seo-folder",
    "document-folder",
    "briefcase",
    "box",
    "toolkit",
    "cloud-storage",
    "building-one",
    "building-two",
    "building-three",
    "building-four",
    "application",
    "application-one",
    "application-two",
    "all-application",
    "category-management",
    "city",
    "city-one",
    "castle",
    "warehouse",
    "inbox-in",
    "inbox-out",
    "inbox-r",
    "inbox-success",
    "inbox-download-r",
    "inbox-upload-r",
    "components",
    "data-server",
    "data-all",
    "data-display",
    "data-sheet",
    "server",
  ],
  communication: [
    "mail",
    "send-email",
    "email-successfully",
    "email-push",
    "email-search",
    "email-fail",
    "email-down",
    "timed-mail",
    "phone",
    "phone-call",
    "phone-telephone",
    "phone-incoming",
    "phone-outgoing",
    "phone-missed",
    "phone-video-call",
    "comment",
    "comment-one",
    "comments",
    "communication",
    "message",
    "message-one",
    "message-unread",
    "message-sent",
    "message-privacy",
    "message-security",
    "message-search",
    "text-message",
    "voice-message",
    "voicemail",
    "announcement",
    "broadcast",
    "broadcast-one",
    "broadcast-radio",
    "share",
    "share-one",
    "share-two",
    "share-three",
    "send",
    "send-one",
    "video",
    "video-one",
    "video-two",
    "video-conference",
    "headset",
    "voice",
    "voice-one",
    "telegram",
    "twitter",
    "wechat",
  ],
  people: [
    "people",
    "peoples",
    "peoples-two",
    "user",
    "user-business",
    "avatar",
    "add-user",
    "reduce-user",
    "right-user",
    "wrong-user",
    "people-plus",
    "people-minus",
    "people-search",
    "people-search-one",
    "people-speak",
    "people-top-card",
    "people-bottom-card",
    "people-unknown",
    "people-download",
    "people-upload",
    "customer",
    "cooperative-handshake",
    "id-card",
    "id-card-h",
    "id-card-v",
    "passport",
    "passport-one",
    "necktie",
    "worker",
    "boy",
    "girl",
    "women",
    "woman",
  ],
  work: [
    "wallet",
    "wallet-one",
    "wallet-two",
    "wallet-three",
    "bank",
    "bank-card",
    "bank-card-one",
    "bank-card-two",
    "bank-transfer",
    "paypal",
    "alipay",
    "bitcoin",
    "dollar",
    "currency",
    "credit",
    "payment-method",
    "pay-code",
    "pay-code-one",
    "pay-code-two",
    "calendar",
    "calendar-dot",
    "calendar-three",
    "schedule",
    "appointment",
    "calculator",
    "calculator-one",
    "chart-line",
    "chart-line-area",
    "chart-histogram",
    "chart-histogram-one",
    "chart-histogram-two",
    "chart-pie",
    "chart-pie-one",
    "chart-proportion",
    "chart-ring",
    "chart-scatter",
    "chart-stock",
    "chart-graph",
    "analysis",
    "trend",
    "trend-two",
    "trending-up",
    "dashboard",
    "dashboard-one",
    "dashboard-two",
    "stock-market",
    "transaction",
    "transaction-order",
    "sales-report",
    "setting",
    "setting-one",
    "setting-two",
    "setting-three",
    "setting-config",
    "setting-computer",
    "setting-laptop",
    "setting-web",
    "computer",
    "computer-one",
    "laptop",
    "workbench",
    "coupon",
    "consume",
    "deposit",
  ],
  files: [
    "book",
    "book-one",
    "book-open",
    "bookshelf",
    "address-book",
    "clipboard",
    "agreement",
    "certificate",
    "word",
    "ppt",
    "powerpoint",
    "excel",
    "notes",
    "notepad",
    "editor",
    "edit",
    "edit-one",
    "edit-two",
    "doc-detail",
    "doc-success",
    "doc-fail",
    "doc-search",
    "doc-add",
    "audio-file",
    "video-file",
    "data-file",
    "table-file",
    "collection-files",
    "termination-file",
    "bill",
    "invoice",
    "copy",
    "copy-one",
    "copy-link",
  ],
  status: [
    "star",
    "star-one",
    "bookmark",
    "bookmark-one",
    "bookmark-three",
    "flag",
    "heart",
    "pin",
    "pushpin",
    "success",
    "check",
    "check-one",
    "check-correct",
    "checkbox",
    "checklist",
    "attention",
    "alarm",
    "badge",
    "badge-two",
    "trophy",
    "vip",
    "vip-one",
    "crown",
    "crown-two",
    "crown-three",
    "thumbs-up",
    "thumbs-down",
    "remind",
    "tips",
    "tips-one",
    "help",
    "info",
    "error",
    "correct",
    "done-all",
    "unlike",
    "preview-open",
    "preview-close",
  ],
  misc: [
    "home",
    "home-two",
    "earth",
    "world",
    "planet",
    "wifi",
    "camera",
    "camera-one",
    "gift",
    "puzzle",
    "robot",
    "robot-one",
    "robot-two",
    "time",
    "local",
    "local-two",
    "link",
    "link-one",
    "search",
    "tag",
    "tag-one",
    "picture",
    "picture-one",
    "image",
    "bluetooth",
    "compass",
    "compass-one",
    "map",
    "airplane",
    "car",
    "rocket",
    "rocket-one",
    "light",
    "light-member",
    "idea",
    "creative",
    "game",
    "music",
    "headset-one",
    "history",
    "clock-tower",
    "big-clock",
    "alarm-clock",
    "stopwatch",
    "history-query",
    "link-cloud",
    "link-interrupt",
    "unlink",
    "globe",
  ],
}

const ACRONYMS = new Set([
  "ai",
  "api",
  "aws",
  "cli",
  "cpu",
  "css",
  "csv",
  "db",
  "env",
  "git",
  "go",
  "gpg",
  "gps",
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
  "otp",
  "pdf",
  "php",
  "png",
  "ppt",
  "qr",
  "rss",
  "sd",
  "seo",
  "sql",
  "ssh",
  "ssl",
  "svg",
  "tv",
  "ts",
  "ui",
  "url",
  "usb",
  "vip",
  "vpn",
  "wasm",
  "xml",
  "yaml",
  "yml",
  "zip",
  "gcp",
])

const PARK_SKIP =
  /^(align-|alignment-|bring-|send-backward|send-to-back|sent-to-back|text-bold|text-italic|text-underline|text-style|strikethrough|background-color|drop-shadow-|corner-|block-|weixin-|bytedance|clothes-|sperm|uterus|abdominal|plastic-surgery|breast-pump|endocrine|renal|xiaodu|xigua|xingfuli|xingtu|zijinyunying|dongchedi|tuchong|ulikecam|qiyehao|qingniao|baokemeng|baby-|diapers|bib$|breast)/

const KEYBOARD_KEY =
  /^(one|two|three|four|five|six|seven|eight|nine|zero|asterisk|delete)-key$|^arrow-keys$/

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

function hasToken(name, ...tokens) {
  const set = new Set(name.split("-"))
  return tokens.some((t) => set.has(t))
}

function skipPark(name) {
  if (PARK_SKIP.test(name)) return true
  if (/-face$/.test(name) || name.endsWith("-face-with-open-mouth")) return true
  if (name.endsWith("-zodiac")) return true
  return false
}

function groupPark(name) {
  if (!KEYBOARD_KEY.test(name)) {
    if (
      hasToken(
        name,
        "lock",
        "unlock",
        "key",
        "keyhole",
        "locking",
        "shield",
        "protect",
        "protection",
        "security",
        "permissions",
        "fingerprint",
        "privacy",
        "strongbox",
        "surveillance",
        "forbid"
      ) ||
      name === "safe-retrieval" ||
      name.startsWith("people-safe") ||
      name.startsWith("two-dimensional-code") ||
      name.startsWith("scan-code") ||
      name.startsWith("electronic-locks") ||
      name === "electronic-door-lock" ||
      name === "induction-lock" ||
      name === "insurance" ||
      name === "harm" ||
      name === "caution" ||
      name === "inspection" ||
      name === "flight-safety" ||
      name === "prison" ||
      name === "seal" ||
      name === "scan" ||
      name.startsWith("scanning") ||
      name.startsWith("umbrella") ||
      name.startsWith("folder-block") ||
      name === "email-block" ||
      name === "database-forbid"
    ) {
      return "security"
    }
  }

  if (
    hasToken(
      name,
      "people",
      "peoples",
      "user",
      "avatar",
      "customer",
      "worker",
      "woman",
      "women",
      "passport",
      "necktie"
    ) ||
    name === "boy" ||
    name.startsWith("boy-") ||
    name === "girl" ||
    name.startsWith("girl-") ||
    name === "cooperative-handshake" ||
    name.startsWith("id-card")
  ) {
    return "people"
  }

  if (
    hasToken(
      name,
      "file",
      "document",
      "doc",
      "book",
      "clipboard",
      "notebook",
      "agreement",
      "certificate",
      "word",
      "ppt",
      "powerpoint",
      "excel",
      "notes",
      "editor",
      "notepad",
      "invoice",
      "bill"
    ) ||
    name.startsWith("doc-")
  ) {
    return "files"
  }

  if (
    hasToken(
      name,
      "mail",
      "email",
      "phone",
      "comment",
      "comments",
      "message",
      "chat",
      "video",
      "headset",
      "broadcast",
      "announcement",
      "communication",
      "megaphone",
      "share",
      "voice",
      "telegram",
      "voicemail"
    ) ||
    name === "send" ||
    name.startsWith("send-") ||
    name === "receive"
  ) {
    return "communication"
  }

  if (
    hasToken(
      name,
      "wallet",
      "bank",
      "pay",
      "paypal",
      "dollar",
      "bitcoin",
      "currency",
      "credit",
      "calendar",
      "chart",
      "setting",
      "config",
      "laptop",
      "computer",
      "workbench",
      "trend",
      "analysis",
      "dashboard",
      "stock",
      "transaction",
      "deposit",
      "coupon",
      "calculator",
      "finance",
      "sales",
      "schedule",
      "appointment",
      "histogram",
      "consume"
    )
  ) {
    return "work"
  }

  if (
    hasToken(
      name,
      "folder",
      "database",
      "cloud",
      "briefcase",
      "building",
      "toolbox",
      "box",
      "warehouse",
      "storage",
      "cabinet",
      "application",
      "category",
      "city",
      "castle",
      "library",
      "archive",
      "components",
      "inbox",
      "server",
      "toolkit"
    )
  ) {
    return "folders"
  }

  if (
    hasToken(
      name,
      "star",
      "bookmark",
      "flag",
      "heart",
      "success",
      "check",
      "attention",
      "alarm",
      "badge",
      "trophy",
      "vip",
      "unlike",
      "thumbs",
      "crown",
      "remind",
      "tips",
      "help",
      "question",
      "error",
      "done",
      "correct",
      "medal",
      "ribbon",
      "pin",
      "pushpin",
      "preview"
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
const seen = new Set()

function addIcon(prefix, name, group) {
  const key = `${prefix}:${name}`
  if (seen.has(key)) return false
  if (catalog.length >= LIMIT) return false
  catalog.push({
    prefix,
    name,
    label: labelFor(name),
    group,
  })
  seen.add(key)
  return true
}

for (const base of [...fluentBases.keys()].sort()) {
  const name = pickFluentName(base, fluentAvailable)
  if (!name) throw new Error(`missing fluent ${base}`)
  addIcon("fluent-color", name, groupFluent(base))
}

const vscodeAvailable = new Set(Object.keys(vscodeData.icons))

function addVscode(name, group) {
  if (!vscodeAvailable.has(name)) return false
  return addIcon("vscode-icons", name, group)
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

const parkAvailable = new Set(Object.keys(parkData.icons))
/** @type {Record<string, string[]>} */
const parkByGroup = Object.fromEntries(GENERAL_GROUPS.map((g) => [g, []]))

for (const name of [...parkAvailable].sort()) {
  if (skipPark(name)) continue
  const group = groupPark(name)
  parkByGroup[group].push(name)
}

for (const group of GENERAL_GROUPS) {
  const priority = PARK_PRIORITY[group] ?? []
  const preferred = []
  const rest = []
  const prioritySet = new Set(priority)
  for (const name of priority) {
    if (parkAvailable.has(name) && parkByGroup[group].includes(name)) {
      preferred.push(name)
    }
  }
  for (const name of parkByGroup[group]) {
    if (!prioritySet.has(name)) rest.push(name)
  }
  parkByGroup[group] = [...preferred, ...rest]
}

function generalCounts() {
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(GENERAL_GROUPS.map((g) => [g, 0]))
  for (const item of catalog) {
    if (counts[item.group] != null) counts[item.group]++
  }
  return counts
}

while (catalog.length < LIMIT) {
  const counts = generalCounts()
  const groupsWithStock = GENERAL_GROUPS.filter(
    (g) => parkByGroup[g].length > 0
  )
  if (groupsWithStock.length === 0) break
  groupsWithStock.sort(
    (a, b) => counts[a] - counts[b] || a.localeCompare(b)
  )
  const target = groupsWithStock[0]
  const name = parkByGroup[target].shift()
  if (!name) break
  addIcon("icon-park", name, target)
}

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
const parkOutNames = catalog
  .filter((c) => c.prefix === "icon-park")
  .map((c) => c.name)

fs.writeFileSync(
  "src/lib/icons/fluent-color.json",
  JSON.stringify(subset(fluentData, fluentOutNames))
)
fs.writeFileSync(
  "src/lib/icons/vscode-icons.json",
  JSON.stringify(subset(vscodeData, vscodeOutNames))
)
fs.writeFileSync(
  "src/lib/icons/icon-park.json",
  JSON.stringify(subset(parkData, parkOutNames))
)

const entries = catalog
  .map(
    (c) =>
      `  { id: idOf(${JSON.stringify(c.prefix)}, ${JSON.stringify(c.name)}), name: ${JSON.stringify(c.name)}, label: ${JSON.stringify(c.label)}, group: ${JSON.stringify(c.group)} },`
  )
  .join("\n")

const ts = `/**
 * Curated Fluent UI System Color Icons (MIT, Microsoft), IconPark
 * (Apache 2.0, ByteDance), plus VSCode Icons (MIT).
 * Full sets via Iconify:
 * - https://icon-sets.iconify.design/fluent-color/
 * - https://icon-sets.iconify.design/icon-park/
 * - https://icon-sets.iconify.design/vscode-icons/
 *
 * Icons are vendored offline so the vault app never fetches from Iconify CDN.
 * Regenerated by \`node scripts/expand-icons.mjs\`.
 */

import { addCollection } from "@iconify/react"

import fluentColorData from "@/lib/icons/fluent-color.json"
import iconParkData from "@/lib/icons/icon-park.json"
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
  addCollection(iconParkData as Parameters<typeof addCollection>[0])
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
const parkKb = (
  fs.statSync("src/lib/icons/icon-park.json").size / 1024
).toFixed(1)

const groupCounts = {}
for (const item of catalog) {
  groupCounts[item.group] = (groupCounts[item.group] || 0) + 1
}

console.log(
  `icons ${catalog.length} (fluent ${fluentOutNames.length}, icon-park ${parkOutNames.length}, vscode ${vscodeOutNames.length})`
)
console.log(`fluent-color.json ${fluentKb} KB`)
console.log(`icon-park.json ${parkKb} KB`)
console.log(`vscode-icons.json ${vscodeKb} KB`)
console.log("groups", groupCounts)
