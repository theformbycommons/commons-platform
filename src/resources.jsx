import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ResourcesApp from './ResourcesApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ResourcesApp />
  </StrictMode>,
)
