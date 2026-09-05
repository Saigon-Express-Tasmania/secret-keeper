import {
  NotImplementedError,
  type StorageStrategy,
} from "@/lib/storage/types"

/** AWS S3 adapter stub. */
export function createS3Storage(): StorageStrategy {
  return {
    id: "s3",
    async download(_objectKey): Promise<Uint8Array | null> {
      throw new NotImplementedError("s3", "download")
    },
    async upload(_objectKey, _data) {
      throw new NotImplementedError("s3", "upload")
    },
  }
}
