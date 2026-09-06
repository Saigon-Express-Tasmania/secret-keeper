import {
  NotImplementedError,
  type StorageStrategy,
} from "@/lib/storage/types"

/** Supabase Storage adapter stub. */
export function createSupabaseStorage(): StorageStrategy {
  return {
    id: "supabase",
    async download(_objectKey): Promise<Uint8Array | null> {
      throw new NotImplementedError("supabase", "download")
    },
    async upload(_objectKey, _data) {
      throw new NotImplementedError("supabase", "upload")
    },
    async list(_prefix): Promise<string[]> {
      throw new NotImplementedError("supabase", "list")
    },
    async remove(_objectKey) {
      throw new NotImplementedError("supabase", "remove")
    },
  }
}
