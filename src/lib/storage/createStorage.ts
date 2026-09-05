import { createGDriveStorage } from "@/lib/storage/adapters/gdrive"
import { createR2Storage } from "@/lib/storage/adapters/r2"
import { createS3Storage } from "@/lib/storage/adapters/s3"
import { createSupabaseStorage } from "@/lib/storage/adapters/supabase"
import type {
  StorageProviderId,
  StorageStrategy,
} from "@/lib/storage/types"

function parseProvider(value: string | undefined): StorageProviderId {
  const provider = (value ?? "r2").toLowerCase()
  if (
    provider === "r2" ||
    provider === "s3" ||
    provider === "supabase" ||
    provider === "gdrive"
  ) {
    return provider
  }
  throw new Error(
    `Unknown VITE_STORAGE_PROVIDER "${value}". Expected r2 | s3 | supabase | gdrive.`
  )
}

/** Build the active storage strategy from env. */
export function createStorage(): StorageStrategy {
  const provider = parseProvider(import.meta.env.VITE_STORAGE_PROVIDER)

  switch (provider) {
    case "r2":
      return createR2Storage()
    case "s3":
      return createS3Storage()
    case "supabase":
      return createSupabaseStorage()
    case "gdrive":
      return createGDriveStorage()
  }
}

export function getVaultObjectKey(): string {
  return import.meta.env.VITE_VAULT_OBJECT_KEY || "vault.enc"
}
