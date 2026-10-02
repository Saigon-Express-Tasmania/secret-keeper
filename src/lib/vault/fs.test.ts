import { describe, expect, it } from "vitest"

import {
  assertValidName,
  copyNodes,
  createEmptyArchive,
  getNode,
  isRawVaultArchive,
  joinPath,
  mkdir,
  moveNodes,
  putFile,
  splitPath,
  uniqueSiblingPath,
} from "@/lib/vault/fs"

const file = { nonce: "bm9uY2U=", ciphertext: "Y2lwaGVy" }

describe("vault fs", () => {
  it("normalizes paths", () => {
    expect(splitPath("/a//b/")).toEqual(["a", "b"])
    expect(joinPath("a/", "/b", "c")).toBe("a/b/c")
  })

  it("rejects traversal and separators in names", () => {
    for (const bad of ["", ".", "..", "a/b", "a\\b"]) {
      expect(() => assertValidName(bad)).toThrow()
    }
  })

  it("creates files under new folders and resolves them", () => {
    const archive = createEmptyArchive()
    putFile(archive, "work/github.json", file)
    expect(getNode(archive, "work")?.type).toBe("dir")
    expect(getNode(archive, "work/github.json")).toMatchObject({
      type: "file",
      ...file,
    })
    expect(() => getNode(archive, "work/../passwords")).toThrow()
  })

  it("picks unique sibling names", () => {
    const archive = createEmptyArchive()
    putFile(archive, "notes/a.json", file)
    expect(uniqueSiblingPath(archive, "notes", "a.json", "copy")).toBe(
      "notes/a (copy).json"
    )
  })

  it("refuses to move or copy a folder into itself", () => {
    const archive = createEmptyArchive()
    mkdir(archive, "notes/inner")
    expect(() => moveNodes(archive, ["notes"], "notes/inner")).toThrow()
    expect(() => copyNodes(archive, ["notes"], "notes")).toThrow()
  })

  it("validates raw archives (names and shapes)", () => {
    expect(isRawVaultArchive(createEmptyArchive())).toBe(true)
    const bad = createEmptyArchive() as unknown as {
      root: { entries: Record<string, unknown> }
    }
    bad.root.entries[".."] = { type: "dir", entries: {} }
    expect(isRawVaultArchive(bad)).toBe(false)
  })
})
