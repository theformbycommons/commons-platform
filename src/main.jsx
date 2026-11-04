import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
      <App />
      <nav className="community-footer-nav" aria-label="Community resources and events">
        <a href="./events.html">Community resources &amp; calendar</a>
      </nav>
      <footer className="site-footer">© 2026 The Formby Commons</footer>
    </>
  </StrictMode>,
)
