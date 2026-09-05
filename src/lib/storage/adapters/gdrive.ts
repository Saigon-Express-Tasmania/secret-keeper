import {
  NotImplementedError,
  type StorageStrategy,
} from "@/lib/storage/types"

/** Google Drive adapter stub. */
export function createGDriveStorage(): StorageStrategy {
  return {
    id: "gdrive",
    async download(_objectKey): Promise<Uint8Array | null> {
      throw new NotImplementedError("gdrive", "download")
    },
    async upload(_objectKey, _data) {
      throw new NotImplementedError("gdrive", "upload")
    },
  }
}
