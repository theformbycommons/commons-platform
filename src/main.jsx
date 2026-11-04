import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
      <nav className="site-quick-nav" aria-label="Community pages">
        <a href="./resources.html">Community resources</a>{' · '}
        <a href="./events.html">Community events</a>
      </nav>
      <App />
      <footer className="site-footer">© 2026 The Formby Commons</footer>
    </>
  </StrictMode>,
)
