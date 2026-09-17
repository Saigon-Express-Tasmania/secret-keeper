export type { StorageProviderId, StorageStrategy } from "@/lib/storage/types"
export { NotImplementedError } from "@/lib/storage/types"
export { createStorage, toVaultObjectKey } from "@/lib/storage/createStorage"
export {
  loadLocalVault,
  saveLocalVault,
  clearLocalVault,
} from "@/lib/storage/localCache"
