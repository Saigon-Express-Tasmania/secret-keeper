import { createContext, useContext } from "react"

import type { FinderController } from "@/components/dashboard/hooks/useFinderController"

export const FinderContext = createContext<FinderController | null>(null)

export function useFinder(): FinderController {
  const ctx = useContext(FinderContext)
  if (!ctx) throw new Error("useFinder must be used within FinderApp")
  return ctx
}
