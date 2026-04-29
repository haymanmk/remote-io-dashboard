import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RemoteIOProvider } from './context/RemoteIOContext'
import { AlertPage } from './components/AlertPage'
import App from './App'
import './styles/global.css'

const params = new URLSearchParams(window.location.search)
const alertStatus = params.get('alert')

function AlertRoot({ initialStatus }: { initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus)
  useEffect(() => window.remoteio.onAlertStatus(setStatus), [])
  return <AlertPage status={status} />
}

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    {alertStatus ? (
      <AlertRoot initialStatus={alertStatus} />
    ) : (
      <RemoteIOProvider>
        <App />
      </RemoteIOProvider>
    )}
  </StrictMode>,
)
