import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [status, setStatus] = useState('Checking connection...')

  useEffect(() => {
    async function checkConnection() {
      const { error } = await supabase.auth.getSession()

      if (error) {
        setStatus(`Error: ${error.message}`)
      } else {
        setStatus('Connected to Supabase ✅')
      }
    }

    checkConnection()
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>The Formby Commons</h1>
      <p>{status}</p>
    </div>
  )
}

export default App
