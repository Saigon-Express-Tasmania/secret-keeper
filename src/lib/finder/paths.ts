import { safeGetNode } from "@/lib/finder/items"
import type { Location, PathChange } from "@/lib/finder/types"
import {
  getNode,
  joinPath,
  parentPath,
  pathBasename,
  type VaultArchive,
} from "@/lib/vault/fs"

function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/** Apply one move/removal to a path. Removed paths return null. */
export function remapPath(path: string, change: PathChange): string | null {
  if (!isUnder(path, change.from)) return path
  if (change.to === null) return null
  return `${change.to}${path.slice(change.from.length)}`
}

export function applyPathChanges(
  path: string,
  changes: readonly PathChange[]
): string | null {
  let current: string | null = path
  for (const change of changes) {
    if (current === null) return null
    current = remapPath(current, change)
  }
  return current
}

/**
 * Like applyPathChanges, but a location inside a removed folder falls back to
 * the removed item's parent (the window "follows" the deletion upward).
 */
export function remapLocation(
  location: Location,
  changes: readonly PathChange[]
): Location {
  if (location.kind !== "path") return location
  let path = location.path
  for (const change of changes) {
    if (!isUnder(path, change.from)) continue
    path =
      change.to === null
        ? parentPath(change.from)
        : `${change.to}${path.slice(change.from.length)}`
  }
  return path === location.path ? location : { kind: "path", path }
}

/** Closest existing folder at or above `path` (the root always exists). */
export function nearestExistingDir(archive: VaultArchive, path: string): string {
  let current = path
  for (;;) {
    const node = safeGetNode(archive, current)
    if (node?.type === "dir") return current
    if (!current) return ""
    current = parentPath(current)
  }
}

/** "untitled folder", "untitled folder 2", … / "untitled.json", "untitled 2.json", … */
export function untitledName(
  archive: VaultArchive,
  dir: string,
  kind: "folder" | "file"
): string {
  const make = (n: number) =>
    kind === "folder"
      ? n === 1
        ? "untitled folder"
        : `untitled folder ${n}`
      : n === 1
        ? "untitled.json"
        : `untitled ${n}.json`
  for (let n = 1; ; n++) {
    const name = make(n)
    if (!safeGetNode(archive, joinPath(dir, name))) return name
  }
}

/** Error text when a move/copy would put a folder inside itself, else null. */
export function checkTransfer(paths: readonly string[], dest: string): string | null {
  for (const source of paths) {
    if (dest === source || dest.startsWith(`${source}/`)) {
      return `“${pathBasename(source)}” can’t be moved into itself.`
    }
  }
  return null
}

/** True when every source already lives directly in `dest`. */
export function isNoopMove(paths: readonly string[], dest: string): boolean {
  return paths.length > 0 && paths.every((p) => parentPath(p) === dest)
}

/** Existence check that never throws. */
export function pathExists(archive: VaultArchive, path: string): boolean {
  try {
    return getNode(archive, path) !== null
  } catch {
    return false
  }
}
