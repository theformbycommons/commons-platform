import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AdminApp from './AdminApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
      <nav className="site-quick-nav" aria-label="Administrator tools">
        <a href="./events-admin.html">Events &amp; message export</a>
      </nav>
      <AdminApp />
      <footer className="site-footer">© 2026 The Formby Commons</footer>
    </>
  </StrictMode>,
)
