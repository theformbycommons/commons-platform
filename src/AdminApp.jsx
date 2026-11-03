import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const adminRoles = ['administrator']

function AdminApp() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [members, setMembers] = useState([])
  const [rooms, setRooms] = useState([])
  const [messages, setMessages] = useState([])
  const [activeTab, setActiveTab] = useState('members')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
        setLoading(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function checkAdmin() {
      setMembership(null)
      if (!session) return
      setLoading(true)
      const { data, error } = await supabase.from('memberships')
        .select('user_id, role, status, must_change_password')
        .eq('user_id', session.user.id).maybeSingle()
      if (cancelled) return
      if (error) setErrorMessage(error.message)
      setMembership(data || null)
      setLoading(false)
    }
    checkAdmin()
    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    if (membership?.status === 'active' && adminRoles.includes(membership.role) && !membership.must_change_password) {
      refreshAll()
    }
  }, [membership])

  async function refreshAll() {
    setErrorMessage('')
    const [membershipResult, profilesResult, roomResult, messageResult] = await Promise.all([
      supabase.from('memberships').select('user_id, role, status, must_change_password, joined_at').order('joined_at'),
      supabase.from('profiles').select('id, display_name, created_at').order('display_name'),
      supabase.from('rooms').select('*').order('name'),
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(500),
    ])
    const failed = [membershipResult, profilesResult, roomResult, messageResult].find(result => result.error)
    if (failed) {
      setErrorMessage(failed.error.message)
      return
    }
    const profileById = Object.fromEntries((profilesResult.data || []).map(profile => [profile.id, profile]))
    setMembers((membershipResult.data || []).map(item => ({ ...item, profile: profileById[item.user_id] || null })))
    setRooms(roomResult.data || [])
    setMessages(messageResult.data || [])
  }

  async function handleLogin(event) {
    event.preventDefault()
    setErrorMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (error) setErrorMessage(error.message)
    else setLoginPassword('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setMembership(null)
    setMembers([])
    setRooms([])
    setMessages([])
  }

  async function updateMembership(userId, values) {
    setErrorMessage('')
    const { error } = await supabase.from('memberships').update(values).eq('user_id', userId)
    if (error) setErrorMessage(error.message)
    else await refreshAll()
  }

  async function updateMemberName(userId, value) {
    setErrorMessage('')
    const name = value.trim()
    if (name.length < 2 || name.length > 60) {
      setErrorMessage('Display names must be between 2 and 60 characters.')
      return
    }
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', userId)
    if (error) setErrorMessage(error.message)
    else await refreshAll()
  }

  async function updateRoom(room, values) {
    setErrorMessage('')
    const { error } = await supabase.from('rooms').update(values).eq('id', room.id)
    if (error) setErrorMessage(error.message)
    else await refreshAll()
  }

  async function deleteRoom(room) {
    const countResult = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('room_id', room.id)
    if (countResult.error) {
      setErrorMessage(countResult.error.message)
      return
    }
    if (countResult.count > 0) {
      setErrorMessage('This room still has messages. Archive it to preserve the discussion; only empty rooms can be permanently deleted.')
      return
    }
    if (!window.confirm(`Permanently delete the empty room “${room.name}”?`)) return
    const { error } = await supabase.from('rooms').delete().eq('id', room.id)
    if (error) setErrorMessage(error.message)
    else await refreshAll()
  }

  async function updateMessage(message, values) {
    setErrorMessage('')
    const { error } = await supabase.from('messages').update(values).eq('id', message.id)
    if (error) setErrorMessage(error.message)
    else await refreshAll()
  }

  if (!session) return <main className="login-container">
    <h1>Commons administration</h1>
    <form onSubmit={handleLogin}>
      <label>Email<input type="email" required autoComplete="username" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} /></label>
      <label>Password<input type="password" required autoComplete="current-password" value={loginPassword} onChange={event => setLoginPassword(event.target.value)} /></label>
      <button type="submit">Sign in</button>
    </form>
    {errorMessage && <p role="alert">{errorMessage}</p>}
  </main>

  if (loading) return <main className="login-container"><p>Checking administrator access…</p></main>
  if (!membership || membership.status !== 'active' || !adminRoles.includes(membership.role)) return <main className="login-container">
    <h1>Administrator access required</h1><p>This account does not have active administrator privileges.</p>
    <button onClick={handleLogout}>Sign out</button>
  </main>
  if (membership.must_change_password) return <main className="login-container">
    <h1>Password change required</h1><p>Change your temporary password in the member site before accessing administration.</p>
    <a href="./">Go to member site</a>
  </main>

  return <main className="community-app admin-app">
    <header>
      <h1>Commons administration</h1>
      <p>Signed in as {session.user.email}</p>
      <nav><a href="./">Member site</a><button onClick={handleLogout}>Sign out</button></nav>
    </header>
    {errorMessage && <p role="alert">{errorMessage}</p>}
    <nav className="admin-tabs" aria-label="Admin sections">
      {['members', 'rooms', 'messages'].map(tab => <button key={tab} aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
      <button onClick={refreshAll}>Refresh</button>
    </nav>

    {activeTab === 'members' && <section><h2>Memberships</h2>
      <p>Auth email changes and permanent account deletion remain manual in Supabase Dashboard. Use the user ID there to identify accounts.</p>
      {members.map(member => <article className="admin-card" key={member.user_id}>
        <h3>{member.profile?.display_name || 'Profile not set up'}</h3>
        <p><code>{member.user_id}</code></p>
        <label>Display name<input defaultValue={member.profile?.display_name || ''} minLength="2" maxLength="60" onBlur={event => { if (event.target.value !== (member.profile?.display_name || '')) updateMemberName(member.user_id, event.target.value) }} /></label>
        <label>Role<select value={member.role} onChange={event => updateMembership(member.user_id, { role: event.target.value })}>
          <option value="member">Member</option><option value="moderator">Moderator</option><option value="administrator">Administrator</option>
        </select></label>
        <label>Status<select value={member.status} onChange={event => updateMembership(member.user_id, { status: event.target.value })}>
          <option value="active">Active</option><option value="suspended">Suspended</option><option value="removed">Removed</option>
        </select></label>
        <label className="checkbox-label"><input type="checkbox" checked={member.must_change_password} onChange={event => updateMembership(member.user_id, { must_change_password: event.target.checked })} /> Require password change at next login</label>
        {member.user_id === session.user.id && <p>Current administrator account</p>}
      </article>)}
      {members.length === 0 && <p>No memberships found.</p>}
    </section>}

    {activeTab === 'rooms' && <section><h2>Rooms</h2>
      {rooms.map(room => <article className="admin-card" key={room.id}>
        <label>Room name<input defaultValue={room.name} maxLength="120" onBlur={event => { if (event.target.value.trim() && event.target.value !== room.name) updateRoom(room, { name: event.target.value.trim() }) }} /></label>
        <label>Description<textarea defaultValue={room.description} onBlur={event => { if (event.target.value !== room.description) updateRoom(room, { description: event.target.value }) }} /></label>
        <p>Status: {room.archived_at ? 'Archived' : 'Active'}</p>
        <button onClick={() => updateRoom(room, { archived_at: room.archived_at ? null : new Date().toISOString() })}>{room.archived_at ? 'Restore room' : 'Archive room'}</button>
        <button onClick={() => deleteRoom(room)}>Delete empty room</button>
      </article>)}
      {rooms.length === 0 && <p>No rooms found.</p>}
    </section>}

    {activeTab === 'messages' && <section><h2>Recent messages</h2>
      <p>Showing up to 500 most recent messages. Delete is a soft-delete; restore is available for previously deleted messages.</p>
      {messages.map(item => <MessageCard key={item.id} item={item} rooms={rooms} onSave={updateMessage} />)}
      {messages.length === 0 && <p>No messages found.</p>}
    </section>}
  </main>
}

function MessageCard({ item, rooms, onSave }) {
  const [body, setBody] = useState(item.body)
  const roomName = rooms.find(room => room.id === item.room_id)?.name || 'Unknown room'
  return <article className="admin-card">
    <p><strong>{roomName}</strong> · {new Date(item.created_at).toLocaleString('en-GB')}</p>
    <p><small>Author ID: <code>{item.author_id}</code></small></p>
    <label>Message<textarea maxLength="10000" value={body} onChange={event => setBody(event.target.value)} /></label>
    <button disabled={!body.trim() || body === item.body} onClick={() => onSave(item, { body: body.trim(), edited_at: new Date().toISOString() })}>Save edit</button>
    {item.deleted_at
      ? <button onClick={() => onSave(item, { deleted_at: null })}>Restore message</button>
      : <button onClick={() => { if (window.confirm('Soft-delete this message?')) onSave(item, { deleted_at: new Date().toISOString() }) }}>Delete message</button>}
  </article>
}

export default AdminApp
