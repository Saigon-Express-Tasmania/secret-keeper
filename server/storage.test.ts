import { afterEach, describe, expect, it, vi } from "vitest"

import { decodeAuthRecord, encodeAuthRecord, type AuthRecord } from "./authRecord"
import {
  backupDue,
  backupObjectKey,
  parseBackupKey,
  pruneBackups,
} from "./backups"
import { lockSecondsAfter } from "./lockout"
import { MemoryStore } from "./memoryStore"
import { loadMeta, updateMeta } from "./meta"
import { createR2Store, parseListObjectsV2 } from "./r2Store"
import { PreconditionFailedError } from "./store"

const bytes = (text: string) => new TextEncoder().encode(text)

describe("MemoryStore", () => {
  it("implements conditional writes", async () => {
    const store = new MemoryStore()
    const { etag } = await store.put("k", bytes("a"), { ifNoneMatch: "*" })
    await expect(store.put("k", bytes("b"), { ifNoneMatch: "*" })).rejects.toBeInstanceOf(
      PreconditionFailedError
    )
    await expect(store.put("k", bytes("b"), { ifMatch: '"nope"' })).rejects.toBeInstanceOf(
      PreconditionFailedError
    )
    await store.put("k", bytes("b"), { ifMatch: etag })
    expect(new TextDecoder().decode((await store.get("k"))!.body)).toBe("b")
  })

  it("copies metadata and lists by prefix", async () => {
    const store = new MemoryStore()
    await store.put("a/1", bytes("x"), { meta: { ck: "3" } })
    await store.copy("a/1", "b/1")
    expect((await store.head("b/1"))?.meta).toEqual({ ck: "3" })
    expect(await store.list("a/")).toEqual(["a/1"])
    await store.delete("a/1")
    await store.delete("missing")
    expect(await store.head("a/1")).toBeNull()
  })
})

describe("auth record", () => {
  const record: AuthRecord = {
    vid: "AAAAAAAAAAAAAAAAAAAAAA",
    rev: 4,
    kdf: { alg: "argon2id", v: 19, m: 65536, t: 3, p: 1, salt: "AAAAAAAAAAAAAAAAAAAAAA" },
    sh: "hash",
    av: "1.av",
    rv: "1.rv",
    sp: "1.sp",
    ae: 2,
    bk: 10,
    pr: 0,
  }

  it("round-trips through object metadata", () => {
    expect(decodeAuthRecord(encodeAuthRecord(record))).toEqual(record)
    expect(decodeAuthRecord(encodeAuthRecord({ ...record, se: "1.se" }))?.se).toBe("1.se")
  })

  it("rejects foreign or malformed metadata", () => {
    expect(decodeAuthRecord({})).toBeNull()
    expect(decodeAuthRecord({ ...encodeAuthRecord(record), rev: "x" })).toBeNull()
    expect(decodeAuthRecord({ ...encodeAuthRecord(record), kdf: "bad" })).toBeNull()
  })
})

describe("meta.json compare-and-swap", () => {
  it("creates, updates and skips unchanged writes", async () => {
    const store = new MemoryStore()
    await updateMeta(store, "v", "vid", (meta) => {
      meta.lock.fails = 1
      return { value: null, changed: true }
    })
    const putSpy = vi.spyOn(store, "put")
    await updateMeta(store, "v", "vid", () => ({ value: null, changed: false }))
    expect(putSpy).not.toHaveBeenCalled()
    expect((await loadMeta(store, "v", "vid")).meta.lock.fails).toBe(1)
  })

  it("retries a lost race with fresh state", async () => {
    const store = new MemoryStore()
    await updateMeta(store, "v", "vid", () => ({ value: 0, changed: true }))
    store.failNextPut.add("meta/v.json")
    let runs = 0
    await updateMeta(store, "v", "vid", (meta) => {
      runs++
      meta.lock.fails += 1
      return { value: null, changed: true }
    })
    expect(runs).toBe(2)
    expect((await loadMeta(store, "v", "vid")).meta.lock.fails).toBe(1)
  })

  it("starts fresh when the vault id changed", async () => {
    const store = new MemoryStore()
    await updateMeta(store, "v", "old", (meta) => {
      meta.lock.fails = 9
      return { value: null, changed: true }
    })
    expect((await loadMeta(store, "v", "new")).meta.lock.fails).toBe(0)
  })
})

describe("lockout schedule", () => {
  it.each([
    [5, 0],
    [6, 60],
    [7, 120],
    [10, 960],
    [14, 4 * 3600],
    [40, 4 * 3600],
  ])("%i failures → %i s", (failures, seconds) => {
    expect(lockSecondsAfter(failures)).toBe(seconds)
  })
})

describe("backups", () => {
  it("names and parses timestamped keys", () => {
    const date = new Date(Date.UTC(2026, 8, 6, 8, 0, 0))
    const key = backupObjectKey("vault", date)
    expect(key).toBe("backups/vault/20260906T080000Z.enc")
    expect(parseBackupKey("vault", key)).toBe(date.getTime())
    expect(parseBackupKey("other", key)).toBeNull()
    expect(parseBackupKey("vault", "backups/vault/20261399T000000Z.enc")).toBeNull()
  })

  it("decides when a backup is due", () => {
    expect(backupDue(0, 8 * 3600, 8, false)).toBe(true)
    expect(backupDue(100, 100 + 3600, 8, false)).toBe(false)
    expect(backupDue(100, 100, 8, true)).toBe(true)
    expect(backupDue(0, 1e9, 0, false)).toBe(false)
  })

  it("prunes beyond retention but keeps the newest three", async () => {
    const store = new MemoryStore()
    const day = 24 * 3600 * 1000
    const now = Date.UTC(2026, 9, 1)
    for (const age of [1, 10, 20, 30, 40]) {
      await store.put(backupObjectKey("vault", new Date(now - age * day)), bytes("x"))
    }
    await store.put("backups/vault/notes.txt", bytes("keep"))
    expect(await pruneBackups(store, "vault", now, 7)).toBe(2)
    expect(await store.list("backups/vault/")).toHaveLength(4)
  })
})

describe("R2 store (S3 API)", () => {
  afterEach(() => vi.unstubAllGlobals())

  const store = createR2Store({
    accountId: "acct",
    accessKeyId: "AKID",
    secretAccessKey: "secret",
    bucket: "bucket",
  })

  it("parses ListObjectsV2 pages", () => {
    const xml =
      "<ListBucketResult><Key>a&amp;b</Key><Key>c</Key><IsTruncated>true</IsTruncated>" +
      "<NextContinuationToken>tok</NextContinuationToken></ListBucketResult>"
    expect(parseListObjectsV2(xml)).toEqual({ keys: ["a&b", "c"], continuationToken: "tok" })
  })

  it("sends signed conditional puts with metadata", async () => {
    const calls: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        calls.push(input as Request)
        return new Response(null, { status: 200, headers: { etag: '"e2"' } })
      })
    )
    const result = await store.put("vaults/v.enc", bytes("x"), {
      ifMatch: '"e1"',
      meta: { ck: "3", rev: "2" },
    })
    expect(result.etag).toBe('"e2"')
    const request = calls[0]!
    expect(request.method).toBe("PUT")
    expect(request.url).toBe("https://acct.r2.cloudflarestorage.com/bucket/vaults/v.enc")
    expect(request.headers.get("if-match")).toBe('"e1"')
    expect(request.headers.get("x-amz-meta-ck")).toBe("3")
    expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /)
  })

  it("maps 412 to PreconditionFailedError and reads metadata on HEAD", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const request = input as Request
        if (request.method === "PUT") return new Response("", { status: 412 })
        return new Response(null, {
          status: 200,
          headers: { etag: '"e"', "content-length": "5", "x-amz-meta-ck": "3" },
        })
      })
    )
    await expect(store.put("k", bytes("x"), { ifNoneMatch: "*" })).rejects.toBeInstanceOf(
      PreconditionFailedError
    )
    expect(await store.head("k")).toEqual({ etag: '"e"', size: 5, meta: { ck: "3" } })
  })

  it("returns null for missing objects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })))
    expect(await store.head("missing")).toBeNull()
    expect(await store.get("missing")).toBeNull()
  })
})
