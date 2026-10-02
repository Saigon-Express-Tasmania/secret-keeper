import { describe, expect, it } from "vitest"

import { parseSignInFragment } from "../src/lib/vault/signInLink"
import {
  MAIL_PER_DAY,
  mailWait,
  newEmailCode,
  newLinkToken,
  parseEmailAddress,
  signInLink,
  signInLinkMessage,
} from "./email"
import { emptyMeta } from "./meta"

describe("parseEmailAddress", () => {
  it("accepts plain addresses and trims them", () => {
    expect(parseEmailAddress("  pat@example.com ")).toBe("pat@example.com")
    expect(parseEmailAddress("first.last+tag@mail.example.co.uk")).toBe(
      "first.last+tag@mail.example.co.uk"
    )
  })

  it("refuses lists, display names, header tricks and junk", () => {
    for (const bad of [
      "pat",
      "pat@localhost",
      "pat@example.com, eve@example.com",
      "Pat <pat@example.com>",
      "pat@example.com\r\nBcc: eve@example.com",
      "pat@@example.com",
      "pat@.example.com",
      `${"a".repeat(250)}@example.com`,
    ]) {
      expect(() => parseEmailAddress(bad), bad).toThrow()
    }
  })
})

describe("mailWait", () => {
  it("allows 3 emails per 15 minutes and 10 per day", () => {
    const meta = emptyMeta("vid")
    let now = 1_000_000
    meta.mail = [now - 10, now - 5, now - 1]
    expect(mailWait(meta, now)).toBe(15 * 60 - 10)
    meta.mail = []
    for (let i = 0; i < MAIL_PER_DAY; i++) {
      expect(mailWait(meta, now)).toBe(0)
      meta.mail.push(now)
      now += 15 * 60 + 1
    }
    expect(mailWait(meta, now)).toBe(meta.mail[0]! + 24 * 3600 - now)
    expect(mailWait(meta, meta.mail[0]! + 24 * 3600)).toBe(0)
    expect(meta.mail).toHaveLength(MAIL_PER_DAY - 1)
  })
})

describe("codes and links", () => {
  it("makes six-digit codes", () => {
    for (let i = 0; i < 50; i++) expect(newEmailCode()).toMatch(/^\d{6}$/)
  })

  it("puts the token in the fragment, where the page can read it", () => {
    const token = newLinkToken()
    const link = signInLink("https://keep.example", "family", token)
    expect(link.startsWith("https://keep.example/verify#v=family&t=")).toBe(true)
    expect(parseSignInFragment(new URL(link).hash)).toEqual({
      vault: "family",
      token: link.split("&t=")[1],
    })
    expect(parseSignInFragment("#v=family&t=short")).toBeNull()
    expect(parseSignInFragment("#v=Bad%20Name&t=" + link.split("&t=")[1])).toBeNull()
  })

  it("escapes the vault name in the HTML email", () => {
    const message = signInLinkMessage("pat@example.com", "x<y", "https://keep.example/verify#v=x")
    expect(message.html).not.toContain("x<y")
    expect(message.text).toContain("knows your master password")
  })
})
