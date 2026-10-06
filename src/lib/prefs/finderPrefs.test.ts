import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_FINDER_PREFS,
  readFinderPrefs,
  writeFinderPrefs,
} from "@/lib/prefs/finderPrefs"

const KEY = "ck:finder"
let store: Map<string, string>

beforeEach(() => {
  store = new Map()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
})

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe("finder prefs", () => {
  it("defaults to Card view", () => {
    expect(readFinderPrefs()).toEqual(DEFAULT_FINDER_PREFS)
    expect(readFinderPrefs().view).toBe("cards")
  })

  it("moves v1 prefs to Card view once, keeping the rest", () => {
    store.set(KEY, JSON.stringify({ v: 1, view: "icons", iconSize: 96, sidebar: false }))
    const prefs = readFinderPrefs()
    expect(prefs.view).toBe("cards")
    expect(prefs.iconSize).toBe(96)
    expect(prefs.sidebar).toBe(false)
  })

  it("keeps a view chosen after the upgrade", () => {
    writeFinderPrefs({ ...DEFAULT_FINDER_PREFS, view: "list" })
    expect(JSON.parse(store.get(KEY)!).v).toBe(2)
    expect(readFinderPrefs().view).toBe("list")
  })

  it("ignores unknown views and versions", () => {
    store.set(KEY, JSON.stringify({ v: 2, view: "gallery" }))
    expect(readFinderPrefs().view).toBe("cards")
    store.set(KEY, JSON.stringify({ v: 9, view: "list", iconSize: 96 }))
    expect(readFinderPrefs()).toEqual(DEFAULT_FINDER_PREFS)
  })
})
