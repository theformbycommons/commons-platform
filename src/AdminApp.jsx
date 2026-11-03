import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function AdminApp() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [members, setMembers] = useState([])
  const [rooms, setRooms] = useState([])
  const [messages, setMessages] = useState([])
  const [activeTab, setActiveTab] = useState('members')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setMembership(null)
      setLoading(false)
      return
    }

    async function loadMembership() {
      setLoading(true)
      const { data, error } = await supabase
        .from('memberships')
        .select('user_id, role, status, must_change_password')
        .eq('user_id', session.user.id)
        .single()

      if (error) {
        setMembership(null)
      } else {
        setMembership(data)
      }

      setLoading(false)
    }

    loadMembership()
  }, [session])

  useEffect(() => {
    if (
      membership &&
      membership.status === 'active' &&
      membership.role === 'administrator' &&
      membership.must_change_password === false
    ) {
      refreshAll()
    }
  }, [membership])

  async function refreshAll() {
    const [membersResult, profilesResult, roomsResult, messagesResult] = await Promise.all([
      supabase
        .from('memberships')
        .select('user_id, role, status, must_change_password, joined_at')
        .order('joined_at', { ascending: true }),

      supabase
        .from('profiles')
        .select('id, display_name, created_at')
        .order('display_name', { ascending: true }),

      supabase
        .from('rooms')
        .select('*')
        .order('name', { ascending: true }),

      supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    if (membersResult.error) {
      setErrorMessage(membersResult.error.message)
      return
    }
    if (profilesResult.error) {
      setErrorMessage(profilesResult.error.message)
      return
    }
    if (roomsResult.error) {
      setErrorMessage(roomsResult.error.message)
      return
    }
    if (messagesResult.error) {
      setErrorMessage(messagesResult.error.message)
      return
    }

    const profileMap = {}
    ;(profilesResult.data || []).forEach(item => {
      profileMap[item.id] = item
    })

    setMembers((membersResult.data || []).map(item => ({
      ...item,
      profile: profileMap[item.user_id] || null,
    })))

    setRooms(roomsResult.data || [])
    setMessages(messagesResult.data || [])
  }

  async function updateMembership(userId, updates) {
    const { error } = await supabase
      .from('memberships')
      .update(updates)
      .eq('user_id', userId)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await refreshAll()
  }

  async function updateProfileName(userId, name) {
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 60) {
      setErrorMessage('Display names must be between 2 and 60 characters.')
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', userId)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await refreshAll()
  }

  async function archiveRoom(room, archive) {
    const { error } = await supabase
      .from('rooms')
      .update({ archived_at: archive ? new Date().toISOString() : null })
      .eq('id', room.id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await refreshAll()
  }

  async function deleteRoomIfEmpty(room) {
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', room.id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    if (count > 0) {
      setErrorMessage('This room still has messages. Archive it instead of deleting it.')
      return
    }

    const { error: deleteError } = await supabase
      .from('rooms')
      .delete()
      .eq('id', room.id)

    if (deleteError) {
      setErrorMessage(deleteError.message)
      return
    }

    await refreshAll()
  }

  async function updateMessage(message, updates) {
    const { error } = await supabase
      .from('messages')
      .update(updates)
      .eq('id', message.id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await refreshAll()
  }

  if (!session) {
    return (
      <div style={{ maxWidth: '400px', margin: '50px auto' }}>
        <h1>Admin login</h1>
        <p>Please sign in with an administrator account.</p>
      </div>
    )
  }

  if (loading) {
    return <p>Checking administrator access…</p>
  }

  if (!membership || membership.status !== 'active' || membership.role !== 'administrator') {
    return (
      <div style={{ maxWidth: '450px', margin: '50px auto' }}>
        <h1>Access denied</h1>
        <p>This account is not an active administrator.</p>
      </div>
    )
  }

  if (membership.must_change_password) {
    return (
      <div style={{ maxWidth: '450px', margin: '50px auto' }}>
        <h1>Password change required</h1>
        <p>Change your temporary password in the member site before using admin.</p>
        <a href="./">Go to member site</a>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '40px auto', padding: '0 16px' }}>
      <h1>Community administration</h1>
      <p>Signed in as: {session.user.email}</p>

      <nav style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        {['members', 'rooms', 'messages'].map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{ fontWeight: activeTab === tab ? 'bold' : 'normal' }}
          >
            {tab}
          </button>
        ))}
      </nav>

      {errorMessage && <p style={{ color: 'crimson' }}>{errorMessage}</p>}

      {activeTab === 'members' && (
        <section>
          <h2>Members</h2>

          {members.map(member => (
            <div
              key={member.user_id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px',
              }}
            >
              <div>
                <strong>{member.profile?.display_name || 'No display name'}</strong>
              </div>

              <div>
                User ID: <code>{member.user_id}</code>
              </div>

              <label>
                Display name
                <input
                  defaultValue={member.profile?.display_name || ''}
                  onBlur={e => updateProfileName(member.user_id, e.target.value)}
                />
              </label>

              <label>
                Role
                <select
                  value={member.role}
                  onChange={e => updateMembership(member.user_id, { role: e.target.value })}
                >
                  <option value="member">Member</option>
                  <option value="moderator">Moderator</option>
                  <option value="administrator">Administrator</option>
                </select>
              </label>

              <label>
                Status
                <select
                  value={member.status}
                  onChange={e => updateMembership(member.user_id, { status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="removed">Removed</option>
                </select>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={Boolean(member.must_change_password)}
                  onChange={e =>
                    updateMembership(member.user_id, {
                      must_change_password: e.target.checked,
                    })
                  }
                />
                Require password change at next login
              </label>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'rooms' && (
        <section>
          <h2>Rooms</h2>

          {rooms.map(room => (
            <div
              key={room.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px',
              }}
            >
              <div><strong>{room.name}</strong></div>
              <div>{room.description}</div>

              <button
                type="button"
                onClick={() => archiveRoom(room, !room.archived_at)}
              >
                {room.archived_at ? 'Restore room' : 'Archive room'}
              </button>

              <button
                type="button"
                onClick={() => deleteRoomIfEmpty(room)}
                style={{ marginLeft: '8px' }}
              >
                Delete empty room
              </button>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'messages' && (
        <section>
          <h2>Messages</h2>

          {messages.map(message => (
            <div
              key={message.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px',
              }}
            >
              <div>
                <strong>{message.id}</strong>
              </div>
              <div>{message.body}</div>

              <label>
                Edit message
                <textarea
                  defaultValue={message.body}
                  onBlur={e => {
                    if (e.target.value.trim() && e.target.value !== message.body) {
                      updateMessage(message, {
                        body: e.target.value.trim(),
                        edited_at: new Date().toISOString(),
                      })
                    }
                  }}
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  updateMessage(message, {
                    deleted_at: message.deleted_at ? null : new Date().toISOString(),
                  })
                }
              >
                {message.deleted_at ? 'Restore message' : 'Soft delete message'}
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

export default AdminApp
