import type { ReactNode } from "react"

import { AppBackdrop } from "@/components/AppBackdrop"

type DesktopProps = {
  /** Top menu bar (rendered above the desktop area). */
  menuBar?: ReactNode
  /** Desktop icons, pinned to the top-right corner. */
  icons?: ReactNode
  children: ReactNode
}

/** Wallpaper + menu bar + the area windows live in. */
export function Desktop({ menuBar, icons, children }: DesktopProps) {
  return (
    <div className="relative flex h-svh flex-col overflow-hidden font-sans text-mac-body">
      <AppBackdrop variant="desktop" />
      {menuBar}
      <div className="relative min-h-0 flex-1">
        {icons ? (
          <div className="absolute top-4 right-5 z-0 flex flex-col items-end gap-4">
            {icons}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}
