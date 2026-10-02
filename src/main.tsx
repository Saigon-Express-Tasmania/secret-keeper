import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { purgeLegacyCaches } from '@/lib/device/deviceStore'
import { registerFluentColorIcons } from '@/lib/icons/catalog'

registerFluentColorIcons()
// Old builds cached vault ciphertext in localStorage forever (audit F8).
purgeLegacyCaches()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
