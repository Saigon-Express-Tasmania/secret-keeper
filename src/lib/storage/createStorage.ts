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

/**
 * Turn a Gate / CLI vault name into a storage object key.
 * Empty names and path separators are rejected. A trailing `.enc` is added
 * when missing (case-insensitive check).
 */
export function toVaultObjectKey(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error("Vault name cannot be empty.")
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Vault name cannot contain path separators.")
  }
  if (trimmed.toLowerCase().endsWith(".enc")) {
    return trimmed
  }
  return `${trimmed}.enc`
}
