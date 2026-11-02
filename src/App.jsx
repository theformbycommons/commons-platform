import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setMessage('Signing in...')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setMessage('')
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setMessage('Signed out')
  }

  if (session) {
    return (
      <div style={{ maxWidth: '700px', margin: '50px auto', fontFamily: 'Arial' }}>
        <h1>The Formby Commons</h1>
        <p><strong>Logged in as:</strong> {session.user.email}</p>
        <br />
        <button onClick={handleLogout}>Sign Out</button>
        <hr />
        <h2>Members Area</h2>
        <p>Authentication and session persistence are working.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', fontFamily: 'Arial' }}>
      <h1>The Formby Commons</h1>

      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">Sign In</button>
      </form>

      <p>{message}</p>
    </div>
  )
}

export default App
