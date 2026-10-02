import {
  PreconditionFailedError,
  type ObjectHead,
  type ObjectMeta,
  type ObjectStore,
  type PutOptions,
  type StoredObject,
} from "./store"

type Entry = { body: Uint8Array; etag: string; meta: ObjectMeta }

/**
 * In-memory ObjectStore with real ETag/conditional-write semantics.
 * `failNextPut` lets tests inject a lost compare-and-swap race.
 */
export class MemoryStore implements ObjectStore {
  private readonly objects = new Map<string, Entry>()
  private counter = 0
  /** Keys whose next put should fail with a precondition error. */
  readonly failNextPut = new Set<string>()

  private nextEtag(): string {
    this.counter += 1
    return `"m${this.counter}"`
  }

  async head(key: string): Promise<ObjectHead | null> {
    const entry = this.objects.get(key)
    return entry
      ? { etag: entry.etag, size: entry.body.byteLength, meta: { ...entry.meta } }
      : null
  }

  async get(key: string): Promise<StoredObject | null> {
    const entry = this.objects.get(key)
    if (!entry) return null
    return {
      etag: entry.etag,
      size: entry.body.byteLength,
      meta: { ...entry.meta },
      body: entry.body.slice(),
    }
  }

  async put(key: string, body: Uint8Array, options: PutOptions = {}) {
    const existing = this.objects.get(key)
    if (this.failNextPut.delete(key)) throw new PreconditionFailedError(key)
    if (options.ifNoneMatch === "*" && existing) {
      throw new PreconditionFailedError(key)
    }
    if (options.ifMatch !== undefined && existing?.etag !== options.ifMatch) {
      throw new PreconditionFailedError(key)
    }
    const etag = this.nextEtag()
    this.objects.set(key, { body: body.slice(), etag, meta: { ...(options.meta ?? {}) } })
    return { etag }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const source = this.objects.get(sourceKey)
    if (!source) throw new Error(`No such key: ${sourceKey}`)
    this.objects.set(destinationKey, {
      body: source.body.slice(),
      etag: this.nextEtag(),
      meta: { ...source.meta },
    })
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort()
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key)
  }

  /** Test helper: every key currently stored. */
  keys(): string[] {
    return [...this.objects.keys()].sort()
  }
}
