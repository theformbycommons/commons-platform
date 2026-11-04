import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import EventsApp from './EventsApp.jsx'

createRoot(document.getElementById('root')).render(<StrictMode><EventsApp /></StrictMode>)
