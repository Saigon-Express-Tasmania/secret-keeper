/**
 * Development-only ObjectStore on the local filesystem (.local/dev-store).
 * Same conditional-write semantics as R2, single-process only.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  PreconditionFailedError,
  type ObjectHead,
  type ObjectMeta,
  type ObjectStore,
  type PutOptions,
  type StoredObject,
} from "../../server/store"

type Sidecar = { etag: string; meta: ObjectMeta }

export class FileStore implements ObjectStore {
  private readonly root: string

  constructor(root: string) {
    this.root = root
    mkdirSync(root, { recursive: true })
  }

  private paths(key: string) {
    const base = join(this.root, encodeURIComponent(key))
    return { body: `${base}.bin`, sidecar: `${base}.json` }
  }

  private readSidecar(key: string): Sidecar | null {
    const { sidecar } = this.paths(key)
    if (!existsSync(sidecar)) return null
    return JSON.parse(readFileSync(sidecar, "utf8")) as Sidecar
  }

  async head(key: string): Promise<ObjectHead | null> {
    const sidecar = this.readSidecar(key)
    if (!sidecar) return null
    const size = readFileSync(this.paths(key).body).byteLength
    return { etag: sidecar.etag, size, meta: { ...sidecar.meta } }
  }

  async get(key: string): Promise<StoredObject | null> {
    const sidecar = this.readSidecar(key)
    if (!sidecar) return null
    const body = new Uint8Array(readFileSync(this.paths(key).body))
    return { etag: sidecar.etag, size: body.byteLength, meta: { ...sidecar.meta }, body }
  }

  async put(key: string, body: Uint8Array, options: PutOptions = {}) {
    const existing = this.readSidecar(key)
    if (options.ifNoneMatch === "*" && existing) throw new PreconditionFailedError(key)
    if (options.ifMatch !== undefined && existing?.etag !== options.ifMatch) {
      throw new PreconditionFailedError(key)
    }
    const etag = `"f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}"`
    const paths = this.paths(key)
    writeFileSync(paths.body, body)
    writeFileSync(paths.sidecar, JSON.stringify({ etag, meta: options.meta ?? {} }))
    return { etag }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const source = await this.get(sourceKey)
    if (!source) throw new Error(`No such key: ${sourceKey}`)
    await this.put(destinationKey, source.body, { meta: source.meta })
  }

  async list(prefix: string): Promise<string[]> {
    return readdirSync(this.root)
      .filter((file) => file.endsWith(".json"))
      .map((file) => decodeURIComponent(file.slice(0, -".json".length)))
      .filter((key) => key.startsWith(prefix))
      .sort()
  }

  async delete(key: string): Promise<void> {
    const paths = this.paths(key)
    rmSync(paths.body, { force: true })
    rmSync(paths.sidecar, { force: true })
  }
}
