import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"

import { AppIcon } from "@/components/mac/AppIcon"
import {
  MacAlertContext,
  type AlertOptions,
  type ConfirmOptions,
  type MacAlertApi,
} from "@/components/mac/macAlertContext"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type Request =
  | { kind: "alert"; options: AlertOptions; resolve: (v: boolean) => void }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (v: boolean) => void }

/** Promise-based macOS alerts (`alert`, `confirm`) for the whole subtree. */
export function MacAlertProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([])
  const actionRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  const api = useMemo<MacAlertApi>(
    () => ({
      alert: (options) =>
        new Promise<void>((resolve) => {
          setQueue((q) => [...q, { kind: "alert", options, resolve: () => resolve() }])
        }),
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setQueue((q) => [...q, { kind: "confirm", options, resolve }])
        }),
    }),
    []
  )

  const current = queue[0] ?? null

  /** Resolve `req` and drop it — no-op if it was already handled. */
  const finish = useCallback((req: Request, value: boolean) => {
    setQueue((q) => (q[0] === req ? q.slice(1) : q))
    req.resolve(value)
  }, [])

  const destructive = current?.kind === "confirm" && current.options.destructive

  return (
    <MacAlertContext.Provider value={api}>
      {children}
      <AlertDialog
        open={current !== null}
        onOpenChange={(open) => {
          if (!open && current) finish(current, false)
        }}
      >
        {current ? (
          <AlertDialogContent
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              ;(destructive ? cancelRef.current : actionRef.current)?.focus()
            }}
          >
            <AppIcon size={56} />
            <AlertDialogTitle>{current.options.title}</AlertDialogTitle>
            {current.options.message ? (
              <AlertDialogDescription>{current.options.message}</AlertDialogDescription>
            ) : (
              <AlertDialogDescription className="sr-only">
                {current.options.title}
              </AlertDialogDescription>
            )}
            {current.kind === "alert" ? (
              <AlertDialogFooter>
                <AlertDialogAction ref={actionRef} onClick={() => finish(current, true)}>
                  {current.options.okLabel ?? "OK"}
                </AlertDialogAction>
              </AlertDialogFooter>
            ) : (
              <AlertDialogFooter className="grid grid-cols-2">
                <AlertDialogCancel ref={cancelRef} onClick={() => finish(current, false)}>
                  {current.options.cancelLabel ?? "Cancel"}
                </AlertDialogCancel>
                <AlertDialogAction
                  ref={actionRef}
                  destructive={current.options.destructive}
                  onClick={() => finish(current, true)}
                >
                  {current.options.confirmLabel ?? "OK"}
                </AlertDialogAction>
              </AlertDialogFooter>
            )}
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </MacAlertContext.Provider>
  )
}
