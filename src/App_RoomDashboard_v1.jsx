import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [rooms, setRooms] = useState([])
  const [loadingRooms, setLoadingRooms] = useState(false)

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
    }

    loadSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadRooms()
  }, [session])

  async function loadRooms() {
    setLoadingRooms(true)

    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('name')

    if (error) {
      setMessage(`Error loading rooms: ${error.message}`)
    } else {
      setRooms(data || [])
    }

    setLoadingRooms(false)
  }

  async function handleLogin(e) {
    e.preventDefault()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setRooms([])
  }

  if (session) {
    return (
      <div style={{ maxWidth: '900px', margin: '50px auto' }}>
        <h1>The Formby Commons</h1>
        <p><strong>Logged in as:</strong> {session.user.email}</p>
        <button onClick={handleLogout}>Sign Out</button>
        <hr />
        <h2>Rooms</h2>
        {loadingRooms && <p>Loading rooms...</p>}
        {rooms.map((room) => (
          <div key={room.id} style={{ border:'1px solid #ddd', padding:'1rem', marginBottom:'1rem' }}>
            <h3>{room.name}</h3>
            <p>{room.description}</p>
          </div>
        ))}
        {message && <p>{message}</p>}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto' }}>
      <h1>The Formby Commons</h1>
      <form onSubmit={handleLogin}>
        <input type='email' placeholder='Email' value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type='password' placeholder='Password' value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type='submit'>Sign In</button>
      </form>
      <p>{message}</p>
    </div>
  )
}

export default App
