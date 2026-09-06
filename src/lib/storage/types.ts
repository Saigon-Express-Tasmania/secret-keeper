export type StorageProviderId = "r2" | "s3" | "supabase" | "gdrive"

/**
 * Pluggable blob store for the encrypted vault file.
 * Each provider implements its own auth / SDK wiring.
 */
export interface StorageStrategy {
  readonly id: StorageProviderId
  /** Returns ciphertext bytes, or null if the object does not exist. */
  download(objectKey: string): Promise<Uint8Array | null>
  upload(objectKey: string, data: Uint8Array): Promise<void>
  /** Object keys whose names start with `prefix`. */
  list(prefix: string): Promise<string[]>
  /** Deletes an object. Missing keys are not an error. */
  remove(objectKey: string): Promise<void>
}

export class NotImplementedError extends Error {
  constructor(provider: StorageProviderId, method: string) {
    super(`${provider}.${method} is not implemented yet`)
    this.name = "NotImplementedError"
  }
}
