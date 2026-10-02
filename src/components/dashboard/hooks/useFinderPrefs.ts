import { useCallback, useState } from "react"

import {
  readFinderPrefs,
  writeFinderPrefs,
  type FinderPrefs,
} from "@/lib/prefs/finderPrefs"

/** Finder layout prefs, persisted to localStorage on every change. */
export function useFinderPrefs(): [FinderPrefs, (patch: Partial<FinderPrefs>) => void] {
  const [prefs, setPrefs] = useState<FinderPrefs>(readFinderPrefs)
  const update = useCallback((patch: Partial<FinderPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      writeFinderPrefs(next)
      return next
    })
  }, [])
  return [prefs, update]
}
