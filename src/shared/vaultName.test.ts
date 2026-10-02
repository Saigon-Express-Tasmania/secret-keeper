import { describe, expect, it } from "vitest"

import { normalizeVaultName, vaultObjectKey } from "./vaultName"

describe("vault names", () => {
  it("trims and lowercases", () => {
    expect(normalizeVaultName("  My-Vault ")).toBe("my-vault")
    expect(vaultObjectKey("vault")).toBe("vaults/vault.enc")
  })

  it.each(["", " ", "-a", "a-", "a_b", "a.b", "a/b", "bak-x/../y", "x".repeat(49), "ä"])(
    "rejects %j",
    (name) => {
      expect(() => normalizeVaultName(name)).toThrow()
    }
  )

  it("accepts the 48-character maximum", () => {
    expect(normalizeVaultName("a".repeat(48))).toHaveLength(48)
  })
})
