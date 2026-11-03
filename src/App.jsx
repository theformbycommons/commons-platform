import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loadingMembership, setLoadingMembership] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const [rooms, setRooms] = useState([])
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState({})

  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDescription, setNewRoomDescription] = useState('')

  const [newMessage, setNewMessage] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')

  const [collapsedThreads, setCollapsedThreads] = useState({})
  const [expandedMessages, setExpandedMessages] = useState({})

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadInitialSession() {
      const { data } = await supabase.auth.getSession()
      if (mounted) setSession(data.session)
    }

    loadInitialSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function refreshMembership() {
    if (!session?.user?.id) {
      setMembership(null)
      return
    }

    const { data, error } = await supabase
      .from('memberships')
      .select('user_id, role, status, must_change_password')
      .eq('user_id', session.user.id)
      .single()

    if (error) {
      setMembership(null)
      return
    }

    setMembership(data)
  }

  useEffect(() => {
    if (!session) {
      setMembership(null)
      setLoadingMembership(false)
      return
    }

    setLoadingMembership(true)
    refreshMembership().finally(() => setLoadingMembership(false))
  }, [session])

  useEffect(() => {
    if (
      session &&
      membership &&
      membership.status === 'active' &&
      membership.must_change_password === false
    ) {
      loadRooms()
    } else {
      setRooms([])
      setSelectedRoom(null)
      setMessages([])
      setProfiles({})
    }
  }, [session, membership])

  async function loadRooms() {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .is('archived_at', null)
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

    const ids = [...new Set((data || []).map(item => item.author_id).filter(Boolean))]
    if (!ids.length) {
      setProfiles({})
      return
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids)

    const map = {}
    ;(profileData || []).forEach(item => {
      map[item.id] = item.display_name
    })
    setProfiles(map)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setSession(null)
    setMembership(null)
    setSelectedRoom(null)
    setMessages([])
    setRooms([])
    setProfiles({})
    setMessage('')
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setMessage('')

    if (!session) {
      setMessage('You must be signed in.')
      return
    }

    if (!currentPassword.trim()) {
      setMessage('Please enter your current password.')
      return
    }

    if (newPassword.length < 8) {
      setMessage('Your new password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage('The new passwords do not match.')
      return
    }

    // Verify current password before changing it
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    })

    if (verifyError) {
      setMessage('Current password is incorrect.')
      return
    }

    // Actual secure change
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      setMessage(updateError.message)
      return
    }

    // The DB trigger clears must_change_password when encrypted_password changes.
    // Do NOT call a custom RPC here.
    // Reload membership after a brief moment to allow the trigger to finish.
    await new Promise(resolve => setTimeout(resolve, 500))

    await refreshMembership()

    if (membership?.must_change_password === true) {
      setMessage('Password changed. Please sign in again to continue.')
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setMessage('Password updated successfully.')
  }

  async function handleCreateRoom(e) {
    e.preventDefault()
    if (!newRoomName.trim()) return

    const { error } = await supabase.from('rooms').insert({
      name: newRoomName.trim(),
      description: newRoomDescription.trim(),
      created_by: session.user.id,
      is_general: false,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setNewRoomName('')
    setNewRoomDescription('')
    await loadRooms()
  }

  async function handlePost(e) {
    e.preventDefault()
    if (!newMessage.trim() || !selectedRoom) return

    const { error } = await supabase.from('messages').insert({
      room_id: selectedRoom.id,
      author_id: session.user.id,
      body: newMessage.trim(),
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
    if (!replyText.trim() || !replyingTo || !selectedRoom) return

    const { error } = await supabase.from('messages').insert({
      room_id: selectedRoom.id,
      author_id: session.user.id,
      body: replyText.trim(),
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

  function sortNewestFirst(items) {
    return [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  function getRootMessages() {
    return sortNewestFirst(messages.filter(item => item.parent_id === null))
  }

  function getReplies(parentId) {
    return sortNewestFirst(messages.filter(item => item.parent_id === parentId))
  }

  function countReplies(id) {
    return getReplies(id).reduce((total, reply) => total + 1 + countReplies(reply.id), 0)
  }

  function toggleMessageExpansion(id) {
    setExpandedMessages(prev => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  function renderMessageTree(item, depth = 0) {
    const replies = getReplies(item.id)
    const count = countReplies(item.id)
    const collapsed = collapsedThreads[item.id]
    const messageText = String(item.body || '').trim()
    const isLongMessage = messageText.length > 220
    const isExpanded = expandedMessages[item.id] ?? !isLongMessage
    const indentPx = depth === 0 ? 0 : Math.min(depth, 3) * 10

    return (
      <div key={item.id}>
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '12px',
            marginLeft: `${indentPx}px`,
            background: depth > 0 ? '#f8f8f8' : '#fff',
            maxWidth: '100%',
            overflowWrap: 'anywhere',
          }}
        >
          <strong>{profiles[item.author_id] || 'Community member'}</strong><br />
          <small>{new Date(item.created_at).toLocaleString('en-GB')}</small>

          <div
            style={{
              marginTop: '8px',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {isLongMessage && !isExpanded ? `${messageText.slice(0, 220)}…` : messageText}
          </div>

          {isLongMessage && (
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => toggleMessageExpansion(item.id)}
              style={{ marginTop: '8px', marginLeft: 0 }}
            >
              {isExpanded ? 'Show less' : 'Read more'}
            </button>
          )}

          {count > 0 && (
            <button
              type="button"
              onClick={() =>
                setCollapsedThreads(prev => ({
                  ...prev,
                  [item.id]: !prev[item.id],
                }))
              }
              style={{ marginRight: '8px' }}
            >
              {collapsed ? `Expand (${count})` : `Collapse (${count})`}
            </button>
          )}

          <button type="button" onClick={() => setReplyingTo(item)}>
            Reply
          </button>

          {replyingTo?.id === item.id && (
            <form onSubmit={handleReply} style={{ marginTop: '10px' }}>
              <textarea
                rows="3"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                style={{ width: '100%' }}
                placeholder="Write a reply..."
              />
              <div style={{ marginTop: '8px' }}>
                <button type="submit">Post reply</button>
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(null)
                    setReplyText('')
                  }}
                  style={{ marginLeft: '8px' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {!collapsed && replies.map(reply => renderMessageTree(reply, depth + 1))}
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ maxWidth: '420px', margin: '50px auto' }}>
        <h1>The Formby Commons</h1>

        <form onSubmit={handleLogin}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </label>

          <button type="submit">Sign in</button>
        </form>

        {message && <p>{message}</p>}
      </div>
    )
  }

  if (loadingMembership) {
    return <p>Checking membership…</p>
  }

  if (!membership || membership.status !== 'active') {
    return (
      <div style={{ maxWidth: '420px', margin: '50px auto' }}>
        <h1>Membership unavailable</h1>
        <p>Your account does not currently have active community access.</p>
        <button onClick={handleLogout}>Sign out</button>
      </div>
    )
  }

  if (membership.must_change_password) {
    return (
      <div style={{ maxWidth: '500px', margin: '50px auto' }}>
        <h1>Set your private password</h1>
        <p>Please replace your temporary password before continuing.</p>

        <form onSubmit={handlePasswordChange}>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
            />
          </label>

          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password'
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </label>

          <button type="submit">Change password and continue</button>
        </form>

        {message && <p>{message}</p>}
        <button type="button" onClick={handleLogout} style={{ marginTop: '8px' }}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 16px' }}>
      <h1>The Formby Commons</h1>
      <p>Signed in as: {session.user.email}</p>

      <div style={{ marginBottom: '20px' }}>
        <button type="button" onClick={handleLogout} style={{ marginRight: '8px' }}>
          Sign out
        </button>

        {membership.role === 'administrator' && (
          <a href="./admin.html">
            <button type="button">Admin panel</button>
          </a>
        )}
      </div>

      {message && <p>{message}</p>}

      {membership.role === 'administrator' && (
        <div style={{ marginBottom: '24px' }}>
          <h2>Create room</h2>
          <form onSubmit={handleCreateRoom}>
            <label>
              Room name
              <input
                type="text"
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
              />
            </label>

            <label>
              Description
              <textarea
                rows="3"
                value={newRoomDescription}
                onChange={e => setNewRoomDescription(e.target.value)}
                style={{ width: '100%' }}
              />
            </label>

            <button type="submit">Create room</button>
          </form>
        </div>
      )}

      <h2>Rooms</h2>

      {rooms.map(room => (
        <button
          key={room.id}
          type="button"
          onClick={() => {
            setSelectedRoom(room)
            loadMessages(room.id)
          }}
          style={{
            display: 'block',
            marginBottom: '10px',
            fontWeight: selectedRoom?.id === room.id ? 'bold' : 'normal',
          }}
        >
          {room.name}
        </button>
      ))}

      {selectedRoom && (
        <div style={{ marginTop: '30px' }}>
          <h2>{selectedRoom.name}</h2>

          {selectedRoom.description && <p>{selectedRoom.description}</p>}

          <form onSubmit={handlePost}>
            <textarea
              rows="4"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              style={{ width: '100%' }}
              placeholder="Write a message..."
            />
            <button type="submit">Post message</button>
          </form>

          <hr />

          {messages.length === 0 && <p>No messages yet.</p>}
          {getRootMessages().map(msg => renderMessageTree(msg))}
        </div>
      )}
    </div>
  )
}

export default App
