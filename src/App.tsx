import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { VaultProvider, useVault } from "@/context/VaultContext"
import { Dashboard } from "@/screens/Dashboard"
import { Gate } from "@/screens/Gate"

function GateRoute() {
  const { unlocked } = useVault()
  if (unlocked) {
    return <Navigate to="/dashboard" replace />
  }
  return <Gate />
}

export default function App() {
  return (
    <VaultProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GateRoute />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </VaultProvider>
  )
}
