import { useCallback, useMemo, useRef, useState, type Dispatch } from "react"

import type { MacAlertApi } from "@/components/mac/macAlertContext"
import { useVault } from "@/context/VaultContext"
import { createEmptyAccount, serializeAccount } from "@/lib/account/schema"
import { checkTransfer, isNoopMove } from "@/lib/finder/paths"
import type { FinderAction } from "@/lib/finder/state"
import type { PathChange } from "@/lib/finder/types"
import {
  copyNodes,
  joinPath,
  mkdir,
  moveNodes,
  parentPath,
  pruneDescendantPaths,
  renameNode,
  setNodeIcon,
  type VaultArchive,
} from "@/lib/vault/fs"
import {
  listRecycleBin,
  moveToRecycleBin,
  purgeRecycleBin,
  restoreFromRecycleBin,
} from "@/lib/vault/recycleBin"

export type FinderMutations = {
  /** True while a save runs (ours or the editor's). */
  busy: boolean
  /** Keys dimmed while their save is in flight. */
  pendingKeys: ReadonlySet<string>
  createFolder: (parent: string, name: string) => Promise<string | null>
  createAccount: (parent: string, name: string) => Promise<string | null>
  rename: (path: string, newName: string) => Promise<string | null>
  move: (paths: string[], dest: string) => Promise<string[] | null>
  copy: (paths: string[], dest: string) => Promise<string[] | null>
  duplicate: (paths: string[]) => Promise<string[] | null>
  trash: (paths: string[]) => Promise<boolean>
  putBack: (ids: string[]) => Promise<string[] | null>
  deleteImmediately: (ids: string[]) => Promise<boolean>
  emptyTrash: () => Promise<boolean>
  setIcon: (path: string, iconId: string | undefined) => Promise<boolean>
}

const EMPTY: ReadonlySet<string> = new Set()
const FAILED = "The operation can’t be completed."

/**
 * Every vault change goes through one single-flight `run`: saves are slow
 * (full re-encrypt + upload) and not optimistic, so a second change while one
 * is in flight is ignored instead of racing it.
 */
export function useFinderMutations(
  dispatch: Dispatch<FinderAction>,
  alerts: MacAlertApi
): FinderMutations {
  const { commit, putEncryptedFile, saving, payload } = useVault()
  const inFlight = useRef(false)
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(EMPTY)
  const [running, setRunning] = useState(false)

  const run = useCallback(
    async <T,>(
      pending: string[],
      task: () => Promise<T>
    ): Promise<{ ok: true; value: T } | { ok: false }> => {
      if (inFlight.current) return { ok: false }
      inFlight.current = true
      setRunning(true)
      setPendingKeys(pending.length ? new Set(pending) : EMPTY)
      try {
        return { ok: true, value: await task() }
      } catch (err) {
        await alerts.alert({
          title: FAILED,
          message: err instanceof Error ? err.message : String(err),
        })
        return { ok: false }
      } finally {
        inFlight.current = false
        setRunning(false)
        setPendingKeys(EMPTY)
      }
    },
    [alerts]
  )

  const mutate = useCallback(
    async <T,>(pending: string[], fn: (archive: VaultArchive) => T | Promise<T>) =>
      run(pending, async () => {
        let value!: T
        await commit(async (archive) => {
          value = await fn(archive)
        })
        return value
      }),
    [commit, run]
  )

  const pathsChanged = useCallback(
    (changes: PathChange[]) => dispatch({ type: "pathsChanged", changes }),
    [dispatch]
  )

  const createFolder = useCallback(
    async (parent: string, name: string) => {
      const path = joinPath(parent, name)
      const r = await mutate([], (a) => mkdir(a, path))
      return r.ok ? path : null
    },
    [mutate]
  )

  const createAccount = useCallback(
    async (parent: string, name: string) => {
      const path = joinPath(parent, name)
      const r = await run([], () =>
        putEncryptedFile(path, serializeAccount(createEmptyAccount()))
      )
      return r.ok ? path : null
    },
    [run, putEncryptedFile]
  )

  const rename = useCallback(
    async (path: string, newName: string) => {
      const r = await mutate([path], (a) => renameNode(a, path, newName))
      if (!r.ok) return null
      pathsChanged([{ from: path, to: r.value }])
      return r.value
    },
    [mutate, pathsChanged]
  )

  const move = useCallback(
    async (paths: string[], dest: string) => {
      const targets = pruneDescendantPaths(paths)
      if (targets.length === 0 || isNoopMove(targets, dest)) return targets
      const problem = checkTransfer(targets, dest)
      if (problem) {
        await alerts.alert({ title: FAILED, message: problem })
        return null
      }
      const r = await mutate(targets, (a) => moveNodes(a, targets, dest))
      if (!r.ok) return null
      pathsChanged(targets.map((from, i) => ({ from, to: r.value[i] ?? null })))
      return r.value
    },
    [alerts, mutate, pathsChanged]
  )

  const copy = useCallback(
    async (paths: string[], dest: string) => {
      const targets = pruneDescendantPaths(paths)
      if (targets.length === 0) return []
      const problem = checkTransfer(targets, dest)
      if (problem) {
        await alerts.alert({ title: FAILED, message: problem.replace("moved", "copied") })
        return null
      }
      const r = await mutate([], (a) => copyNodes(a, targets, dest))
      return r.ok ? r.value : null
    },
    [alerts, mutate]
  )

  const duplicate = useCallback(
    async (paths: string[]) => {
      const targets = pruneDescendantPaths(paths)
      if (targets.length === 0) return []
      const byParent = new Map<string, string[]>()
      for (const p of targets) {
        const parent = parentPath(p)
        byParent.set(parent, [...(byParent.get(parent) ?? []), p])
      }
      const r = await mutate([], (a) => {
        const placed: string[] = []
        for (const [parent, group] of byParent) placed.push(...copyNodes(a, group, parent))
        return placed
      })
      return r.ok ? r.value : null
    },
    [mutate]
  )

  const trash = useCallback(
    async (paths: string[]) => {
      const targets = pruneDescendantPaths(paths)
      if (targets.length === 0) return false
      const r = await mutate(targets, (a) => moveToRecycleBin(a, targets))
      if (!r.ok) return false
      pathsChanged(targets.map((from) => ({ from, to: null })))
      return true
    },
    [mutate, pathsChanged]
  )

  const putBack = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return []
      const r = await mutate(
        ids.map((id) => `trash:${id}`),
        (a) => restoreFromRecycleBin(a, ids)
      )
      return r.ok ? r.value : null
    },
    [mutate]
  )

  const deleteImmediately = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return false
      const r = await mutate(
        ids.map((id) => `trash:${id}`),
        (a) => purgeRecycleBin(a, ids)
      )
      return r.ok
    },
    [mutate]
  )

  const emptyTrash = useCallback(async () => {
    const ids = payload ? listRecycleBin(payload).map((e) => e.id) : []
    if (ids.length === 0) return false
    const r = await mutate(
      ids.map((id) => `trash:${id}`),
      (a) => purgeRecycleBin(a, ids)
    )
    return r.ok
  }, [mutate, payload])

  const setIcon = useCallback(
    async (path: string, iconId: string | undefined) => {
      const r = await mutate([path], (a) => setNodeIcon(a, path, iconId))
      return r.ok
    },
    [mutate]
  )

  const busy = saving || running

  return useMemo(
    () => ({
      busy,
      pendingKeys,
      createFolder,
      createAccount,
      rename,
      move,
      copy,
      duplicate,
      trash,
      putBack,
      deleteImmediately,
      emptyTrash,
      setIcon,
    }),
    [busy, pendingKeys, createFolder, createAccount, rename, move, copy, duplicate, trash, putBack, deleteImmediately, emptyTrash, setIcon]
  )
}
