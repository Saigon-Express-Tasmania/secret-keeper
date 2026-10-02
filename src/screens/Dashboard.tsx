import { Navigate } from "react-router-dom"

import { FinderApp } from "@/components/dashboard/FinderApp"
import { MacAlertProvider } from "@/components/mac/MacAlert"
import { useVault } from "@/context/VaultContext"

export function Dashboard() {
  const { unlocked, payload } = useVault()
  if (!unlocked || !payload) {
    return <Navigate to="/" replace />
  }
  return (
    <MacAlertProvider>
      <FinderApp archive={payload} />
    </MacAlertProvider>
  )
}
