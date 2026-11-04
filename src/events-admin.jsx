import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import EventsAdminApp from './EventsAdminApp.jsx'

createRoot(document.getElementById('root')).render(<StrictMode><EventsAdminApp /></StrictMode>)
