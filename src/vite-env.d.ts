/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE_PROVIDER?: string
  readonly VITE_VAULT_OBJECT_KEY?: string
  /** Argon2 pepper mixed with master password; never stored in the vault blob. */
  readonly VITE_VAULT_SALT_KEY?: string
  /** Prefix for remote vault backup object keys. Default bak- */
  readonly VITE_VAULT_BACKUP_PREFIX?: string
  /** Minimum hours between login backups. 0 disables. Default 8 */
  readonly VITE_VAULT_BACKUP_INTERVAL_HOURS?: string
  /** Days of timestamped backups to keep. Default 7 */
  readonly VITE_VAULT_BACKUP_RETENTION_DAYS?: string
  readonly VITE_R2_ACCOUNT_ID?: string
  readonly VITE_R2_ACCESS_KEY_ID?: string
  readonly VITE_R2_SECRET_ACCESS_KEY?: string
  readonly VITE_R2_BUCKET?: string
  readonly VITE_R2_ENDPOINT?: string
  readonly VITE_S3_REGION?: string
  readonly VITE_S3_ACCESS_KEY_ID?: string
  readonly VITE_S3_SECRET_ACCESS_KEY?: string
  readonly VITE_S3_BUCKET?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_BUCKET?: string
  readonly VITE_GDRIVE_CLIENT_ID?: string
  readonly VITE_GDRIVE_CLIENT_SECRET?: string
  readonly VITE_GDRIVE_REFRESH_TOKEN?: string
  readonly VITE_GDRIVE_FOLDER_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
