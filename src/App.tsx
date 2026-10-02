import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"

import { VaultProvider, useVault } from "@/context/VaultContext"
import { parseSignInFragment } from "@/lib/vault/signInLink"
import { Dashboard } from "@/screens/Dashboard"
import { Gate } from "@/screens/Gate"

function GateRoute() {
  const { unlocked } = useVault()
  if (unlocked) {
    return <Navigate to="/dashboard" replace />
  }
  return <Gate />
}

/** Emailed sign-in link: /verify#v=<vault>&t=<token>. */
function VerifyRoute() {
  const { unlocked } = useVault()
  const location = useLocation()
  const navigate = useNavigate()
  // Read the link once, then drop the token from the address bar and history.
  const [link] = useState(() => parseSignInFragment(location.hash))
  useEffect(() => {
    if (location.hash) navigate(location.pathname, { replace: true })
  }, [location.hash, location.pathname, navigate])
  if (unlocked) {
    return <Navigate to="/dashboard" replace />
  }
  return <Gate signInLink={link} />
}

export default function App() {
  return (
    <VaultProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GateRoute />} />
          <Route path="/verify" element={<VerifyRoute />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </VaultProvider>
  )
}
