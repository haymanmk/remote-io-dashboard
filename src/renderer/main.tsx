import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RemoteIOProvider } from './context/RemoteIOContext'
import App from './App'
import './styles/global.css'

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <RemoteIOProvider>
      <App />
    </RemoteIOProvider>
  </StrictMode>,
)
