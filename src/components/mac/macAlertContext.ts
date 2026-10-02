import { createContext, useContext } from "react"

export type AlertOptions = {
  title: string
  message?: string
  okLabel?: string
}

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button; Cancel gets initial focus. */
  destructive?: boolean
}

export type MacAlertApi = {
  alert: (options: AlertOptions) => Promise<void>
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

export const MacAlertContext = createContext<MacAlertApi | null>(null)

export function useMacAlert(): MacAlertApi {
  const ctx = useContext(MacAlertContext)
  if (!ctx) throw new Error("useMacAlert must be used within MacAlertProvider")
  return ctx
}
