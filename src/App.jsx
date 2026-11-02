import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const [rooms, setRooms] = useState([])
  const [selectedRoom, setSelectedRoom] = useState(null)

  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')

  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')

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

  useEffect(() => {
    if (session) {
      loadRooms()
    }
  }, [session])

  async function loadRooms() {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('name')

    if (error) {
      setMessage(error.message)
      return
    }

    setRooms(data || [])
  }

  async function loadMessages(roomId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .order('created_at')

    if (error) {
      setMessage(error.message)
      return
    }

    setMessages(data || [])
  }

  async function selectRoom(room) {
    setSelectedRoom(room)
    await loadMessages(room.id)
  }

  async function handleLogin(e) {
    e.preventDefault()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()

    setSelectedRoom(null)
    setMessages([])
    setRooms([])
  }

  async function handlePost(e) {
    e.preventDefault()

    if (!newMessage.trim()) return

    const { error } = await supabase
      .from('messages')
      .insert({
        room_id: selectedRoom.id,
        author_id: session.user.id,
        body: newMessage,
      })

    if (error) {
      setMessage(error.message)
      return
    }

    setNewMessage('')
    await loadMessages(selectedRoom.id)
  }

  async function handleReply(e) {
    e.preventDefault()

    if (!replyText.trim()) return

    const { error } = await supabase
      .from('messages')
      .insert({
        room_id: selectedRoom.id,
        author_id: session.user.id,
        body: replyText,
        parent_id: replyingTo.id,
        root_id: replyingTo.root_id || replyingTo.id,
      })

    if (error) {
      setMessage(error.message)
      return
    }

    setReplyText('')
    setReplyingTo(null)

    await loadMessages(selectedRoom.id)
  }

  function getRootMessages() {
    return messages.filter(msg => msg.parent_id === null)
  }

  function getReplies(parentId) {
    return messages.filter(msg => msg.parent_id === parentId)
  }

  function renderMessageTree(msg, depth = 0) {
    const replies = getReplies(msg.id)

    return (
      <div key={msg.id}>
        <div
          style={{
            border: '1px solid #ddd',
            padding: '10px',
            marginBottom: '10px',
            borderRadius: '6px',
            marginLeft: `${depth * 40}px`,
            background: depth > 0 ? '#f8f8f8' : '#ffffff',
          }}
        >
          <p>{msg.body}</p>

          <small>{msg.created_at}</small>

          <br />
          <br />

          <button
            onClick={() => setReplyingTo(msg)}
          >
            Reply
          </button>

          {replyingTo?.id === msg.id && (
            <form onSubmit={handleReply}>
              <br />

              <textarea
                rows="3"
                style={{ width: '100%' }}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
              />

              <br />

              <button type="submit">
                Post Reply
              </button>
            </form>
          )}
        </div>

        {replies.map(reply =>
          renderMessageTree(reply, depth + 1)
        )}
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ maxWidth: '400px', margin: '50px auto' }}>
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

          <button type="submit">
            Sign In
          </button>
        </form>

        <p>{message}</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '50px auto' }}>
      <h1>The Formby Commons</h1>

      <p>
        Logged in as: {session.user.email}
      </p>

      <button onClick={handleLogout}>
        Sign Out
      </button>

      <hr />

      <h2>Rooms</h2>

      {rooms.map((room) => (
        <button
          key={room.id}
          onClick={() => selectRoom(room)}
          style={{ display: 'block', marginBottom: '10px' }}
        >
          {room.name}
        </button>
      ))}

      {selectedRoom && (
        <>
          <hr />

          <h2>{selectedRoom.name}</h2>

          <form onSubmit={handlePost}>
            <textarea
              rows="4"
              style={{ width: '100%' }}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Write a message..."
            />

            <button type="submit">
              Post Message
            </button>
          </form>

          <hr />

          {messages.length === 0 && (
            <p>No messages yet.</p>
          )}

          {getRootMessages().map(msg =>
            renderMessageTree(msg)
          )}
        </>
      )}

      {message && (
        <p>{message}</p>
      )}
    </div>
  )
}

export default App
