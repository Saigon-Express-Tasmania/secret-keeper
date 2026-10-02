/**
 * Minimal object store the vault Function needs. R2 (S3 API) in production,
 * an in-memory map in tests and local development.
 */

export type ObjectMeta = Record<string, string>

export type ObjectHead = {
  etag: string
  size: number
  meta: ObjectMeta
}

export type StoredObject = ObjectHead & { body: Uint8Array }

export type PutOptions = {
  /** Only write if the current ETag matches (compare-and-swap). */
  ifMatch?: string
  /** "*" = only write if the object does not exist yet. */
  ifNoneMatch?: "*"
  /** Custom metadata; keys must be lowercase ASCII. Replaces existing metadata. */
  meta?: ObjectMeta
  contentType?: string
}

export interface ObjectStore {
  head(key: string): Promise<ObjectHead | null>
  get(key: string): Promise<StoredObject | null>
  /** Throws PreconditionFailedError when ifMatch/ifNoneMatch does not hold. */
  put(key: string, body: Uint8Array, options?: PutOptions): Promise<{ etag: string }>
  /** Server-side copy that keeps the source metadata. */
  copy(sourceKey: string, destinationKey: string): Promise<void>
  list(prefix: string): Promise<string[]>
  /** Missing keys are not an error. */
  delete(key: string): Promise<void>
}

export class PreconditionFailedError extends Error {
  constructor(key: string) {
    super(`Precondition failed for ${key}`)
    this.name = "PreconditionFailedError"
  }
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StoreError"
  }
}
