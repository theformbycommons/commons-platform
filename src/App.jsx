import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [membershipLoading, setMembershipLoading] = useState(true)
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
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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
    let cancelled = false
    async function loadMembership() {
      if (!session) {
        setMembership(null)
        setMembershipLoading(false)
        return
      }
      setMembershipLoading(true)
      const { data, error } = await supabase
        .from('memberships')
        .select('user_id, role, status, must_change_password')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setMembership(null)
        setMessage(error?.message || 'This account has no community membership. Please contact the administrator.')
      } else {
        setMembership(data)
        setMessage('')
      }
      setMembershipLoading(false)
    }
    loadMembership()
    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    if (session && membership?.status === 'active' && !membership.must_change_password) {
      loadRooms()
    } else {
      setRooms([])
      setSelectedRoom(null)
      setMessages([])
    }
  }, [session, membership])

  async function loadRooms() {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .is('archived_at', null)
      .order('name')
    if (error) setMessage(error.message)
    else setRooms(data || [])
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
    const authorIds = [...new Set((data || []).map(item => item.author_id).filter(Boolean))]
    if (!authorIds.length) {
      setProfiles({})
      return
    }
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', authorIds)
    const profileMap = {}
    ;(profileData || []).forEach(item => { profileMap[item.id] = item.display_name })
    setProfiles(profileMap)
  }

  async function handleLogin(event) {
    event.preventDefault()
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
    else setPassword('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setMembership(null)
    setSelectedRoom(null)
    setMessages([])
    setRooms([])
    setProfiles({})
  }

  async function handlePasswordChange(event) {
    event.preventDefault()
    setMessage('')
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) {
      setMessage('Enter your temporary password, choose a new password of at least 8 characters, and confirm it.')
      return
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    })
    if (verifyError) {
      setMessage('The current password is incorrect.')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setMessage(updateError.message)
      return
    }

    // A database trigger clears must_change_password only when Auth actually
    // changes encrypted_password. No client-callable completion RPC is used.
    const { data, error: membershipError } = await supabase
      .from('memberships')
      .select('user_id, role, status, must_change_password')
      .eq('user_id', session.user.id)
      .single()
    if (membershipError || data?.must_change_password) {
      setMessage('Your password changed, but onboarding has not yet been confirmed. Please sign out and contact the administrator.')
      return
    }

    setMembership(data)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setMessage('Password updated. You can now use the community.')
  }

  async function handleCreateRoom(event) {
    event.preventDefault()
    if (!newRoomName.trim()) return
    const { error } = await supabase.from('rooms').insert({
      name: newRoomName.trim(),
      description: newRoomDescription.trim(),
      created_by: session.user.id,
      is_general: false,
    })
    if (error) setMessage(error.message)
    else {
      setNewRoomName('')
      setNewRoomDescription('')
      await loadRooms()
    }
  }

  async function handlePost(event) {
    event.preventDefault()
    if (!newMessage.trim() || !selectedRoom) return
    const { error } = await supabase.from('messages').insert({
      room_id: selectedRoom.id,
      author_id: session.user.id,
      body: newMessage.trim(),
    })
    if (error) setMessage(error.message)
    else {
      setNewMessage('')
      await loadMessages(selectedRoom.id)
    }
  }

  async function handleReply(event) {
    event.preventDefault()
    if (!replyText.trim() || !replyingTo || !selectedRoom) return
    const { error } = await supabase.from('messages').insert({
      room_id: selectedRoom.id,
      author_id: session.user.id,
      body: replyText.trim(),
      parent_id: replyingTo.id,
      root_id: replyingTo.root_id || replyingTo.id,
    })
    if (error) setMessage(error.message)
    else {
      setReplyText('')
      setReplyingTo(null)
      await loadMessages(selectedRoom.id)
    }
  }

  function getReplies(parentId) {
    return messages.filter(item => item.parent_id === parentId)
  }

  function countReplies(id) {
    return getReplies(id).reduce((total, reply) => total + 1 + countReplies(reply.id), 0)
  }

  function renderMessageTree(item, depth = 0) {
    const replies = getReplies(item.id)
    const count = countReplies(item.id)
    const collapsed = collapsedThreads[item.id]
    return (
      <article key={item.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 12, margin: `0 0 12px ${Math.min(depth, 6) * 28}px`, background: depth ? '#f8f8f8' : '#fff' }}>
        <strong>{profiles[item.author_id] || 'Community member'}</strong>
        <small style={{ display: 'block', marginTop: 4 }}>{new Date(item.created_at).toLocaleString('en-GB')}</small>
        <p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p>
        {count > 0 && <button type="button" onClick={() => setCollapsedThreads(prev => ({ ...prev, [item.id]: !prev[item.id] }))}>{collapsed ? `Expand (${count})` : `Collapse (${count})`}</button>}
        <button type="button" onClick={() => setReplyingTo(item)} style={{ marginLeft: 8 }}>Reply</button>
        {replyingTo?.id === item.id && <form onSubmit={handleReply}>
          <textarea rows="3" required maxLength="10000" value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Write a reply…" />
          <button type="submit">Post reply</button>
          <button type="button" onClick={() => { setReplyingTo(null); setReplyText('') }}>Cancel</button>
        </form>}
        {!collapsed && replies.map(reply => renderMessageTree(reply, depth + 1))}
      </article>
    )
  }

  if (!session) return <main className="login-container">
    <h1>The Formby Commons</h1>
    <form onSubmit={handleLogin}>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button type="submit">Sign in</button>
    </form>
    {message && <p role="alert">{message}</p>}
  </main>

  if (membershipLoading) return <main className="login-container"><p>Checking your membership…</p></main>
  if (!membership || membership.status !== 'active') return <main className="login-container">
    <h1>Membership unavailable</h1><p>Your account does not currently have active community access. Please contact the administrator.</p>
    <button onClick={handleLogout}>Sign out</button>
  </main>
  if (membership.must_change_password) return <main className="login-container">
    <h1>Set your private password</h1>
    <p>Before entering the community, replace the temporary password with one only you know.</p>
    <form onSubmit={handlePasswordChange}>
      <label>Temporary password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
      <label>New password (at least 8 characters)<input type="password" autoComplete="new-password" minLength="8" required value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
      <button type="submit">Change password and continue</button>
    </form>
    {message && <p role="alert">{message}</p>}
    <button type="button" onClick={handleLogout}>Sign out</button>
  </main>

  return <main className="community-app">
    <header>
      <h1>The Formby Commons</h1>
      <p>Signed in as {session.user.email}</p>
      <nav>
        {membership.role === 'administrator' && <a href="./admin.html">Admin panel</a>}
        <button onClick={handleLogout}>Sign out</button>
      </nav>
    </header>
    {message && <p role="status">{message}</p>}
    {membership.role === 'administrator' && <section>
      <details><summary>Create room</summary>
        <form onSubmit={handleCreateRoom}>
          <label>Room name<input required maxLength="100" value={newRoomName} onChange={event => setNewRoomName(event.target.value)} /></label>
          <label>Description<textarea value={newRoomDescription} onChange={event => setNewRoomDescription(event.target.value)} /></label>
          <button type="submit">Create room</button>
        </form>
      </details>
    </section>}
    <section className="room-list"><h2>Rooms</h2>
      {rooms.length === 0 && <p>No rooms available.</p>}
      {rooms.map(room => <button key={room.id} aria-current={selectedRoom?.id === room.id} onClick={() => { setSelectedRoom(room); loadMessages(room.id) }}>{room.name}</button>)}
    </section>
    {selectedRoom && <section className="discussion">
      <h2>{selectedRoom.name}</h2>
      {selectedRoom.description && <p>{selectedRoom.description}</p>}
      <form onSubmit={handlePost}>
        <label>Start a thread<textarea required maxLength="10000" rows="4" value={newMessage} onChange={event => setNewMessage(event.target.value)} placeholder="Write a message…" /></label>
        <button type="submit">Post message</button>
      </form>
      {messages.filter(item => item.parent_id === null).map(item => renderMessageTree(item))}
      {messages.length === 0 && <p>No messages yet.</p>}
    </section>}
  </main>
}

export default App
