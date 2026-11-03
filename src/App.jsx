import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const [rooms, setRooms] = useState([])
  const [selectedRoom, setSelectedRoom] = useState(null)

  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDescription, setNewRoomDescription] = useState('')

  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState({})
  const [memberList, setMemberList] = useState([])

  const [newMessage, setNewMessage] = useState('')

  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')

  const [collapsedThreads, setCollapsedThreads] = useState({})

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [forcePasswordChange, setForcePasswordChange] = useState(false)

  const [activeView, setActiveView] = useState('chat')

  async function loadProfile() {
    if (!session?.user?.id) return

    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email, is_admin, must_change_password')
      .eq('id', session.user.id)
      .maybeSingle()

    if (error || !data) {
      setProfile({
        id: session.user.id,
        display_name: session.user.email?.split('@')[0] || 'Member',
        email: session.user.email,
        is_admin: false,
        must_change_password: false,
      })
      setForcePasswordChange(false)
      return
    }

    setProfile(data)
    setForcePasswordChange(Boolean(data.must_change_password))
  }

  async function loadMembers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email, is_admin, created_at')
      .order('display_name', { ascending: true })

    if (error) {
      setMemberList([])
      return
    }

    setMemberList(data || [])
  }

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
      loadProfile()
      loadRooms()
      loadMembers()
    }
  }, [session])

  useEffect(() => {
    if (session && profile && !profile.is_admin && activeView === 'admin') {
      setActiveView('chat')
    }
  }, [session, profile, activeView])

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

    const authorIds = [
      ...new Set(
        (data || [])
          .map(msg => msg.author_id)
          .filter(Boolean)
      ),
    ]

    if (authorIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', authorIds)

      const profileMap = {}

      ;(profileData || []).forEach(profileItem => {
        profileMap[profileItem.id] = profileItem.display_name
      })

      setProfiles(profileMap)
    }
  }

  async function selectRoom(room) {
    setSelectedRoom(room)
    await loadMessages(room.id)
  }

  async function handleLogin(e) {
    e.preventDefault()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setSession(data.session)
    setPassword('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()

    setSession(null)
    setProfile(null)
    setSelectedRoom(null)
    setMessages([])
    setRooms([])
    setProfiles({})
    setCollapsedThreads({})
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setForcePasswordChange(false)
    setActiveView('chat')
  }

  async function handlePasswordChange(e) {
    e.preventDefault()

    if (!session) {
      setMessage('You must be signed in to change your password.')
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

    const { error: currentPasswordError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    })

    if (currentPasswordError) {
      setMessage('Current password is incorrect.')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      setMessage(updateError.message)
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', session.user.id)

    if (profileError) {
      setMessage(profileError.message)
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setForcePasswordChange(false)
    await loadProfile()
    setMessage('Password updated successfully.')
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

  async function handleCreateRoom(e) {
    e.preventDefault()

    if (!newRoomName.trim()) return

    const { error } = await supabase
      .from('rooms')
      .insert({
        name: newRoomName,
        description: newRoomDescription,
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

  async function handleMemberToggleAdmin(memberId, nextValue) {
    if (!profile?.is_admin) return

    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: nextValue })
      .eq('id', memberId)

    if (error) {
      setMessage(error.message)
      return
    }

    await loadMembers()
  }

  async function handleMemberDelete(memberId) {
    if (!profile?.is_admin) return

    const { error } = await supabase
      .from('profiles')
      .update({ is_deleted: true, is_admin: false })
      .eq('id', memberId)

    if (error) {
      setMessage(error.message)
      return
    }

    await loadMembers()
  }

  async function handleDeleteRoom(roomId) {
    if (!profile?.is_admin) return

    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId)

    if (error) {
      setMessage(error.message)
      return
    }

    if (selectedRoom?.id === roomId) {
      setSelectedRoom(null)
      setMessages([])
    }

    await loadRooms()
  }

  async function handleDeleteMessage(messageId) {
    if (!profile?.is_admin && messageId) return

    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)

    if (error) {
      setMessage(error.message)
      return
    }

    if (selectedRoom) {
      await loadMessages(selectedRoom.id)
    }
  }

  function getRootMessages() {
    return messages.filter(msg => msg.parent_id === null)
  }

  function getReplies(parentId) {
    return messages.filter(msg => msg.parent_id === parentId)
  }

  function countReplies(messageId) {
    const directReplies = getReplies(messageId)

    return directReplies.reduce(
      (total, reply) =>
        total + 1 + countReplies(reply.id),
      0
    )
  }

  function toggleThread(messageId) {
    setCollapsedThreads(prev => ({
      ...prev,
      [messageId]: !prev[messageId],
    }))
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function renderMessageTree(msg, depth = 0) {
    const replies = getReplies(msg.id)
    const isCollapsed = collapsedThreads[msg.id]
    const replyCount = countReplies(msg.id)

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
          <strong>
            {profiles[msg.author_id] || 'Unknown Member'}
          </strong>

          <br />

          <small>
            {formatDate(msg.created_at)}
          </small>

          <p>{msg.body}</p>

          {replyCount > 0 && (
            <button
              onClick={() => toggleThread(msg.id)}
              style={{ marginRight: '8px' }}
            >
              {isCollapsed
                ? `Expand (${replyCount})`
                : `Collapse (${replyCount})`}
            </button>
          )}

          <button onClick={() => setReplyingTo(msg)} style={{ marginRight: '8px' }}>
            Reply
          </button>

          {profile?.is_admin && (
            <button onClick={() => handleDeleteMessage(msg.id)}>
              Delete message
            </button>
          )}

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
            </form>
          )}
        </div>

        {!isCollapsed &&
          replies.map(reply =>
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

  if (forcePasswordChange) {
    return (
      <div style={{ maxWidth: '500px', margin: '50px auto' }}>
        <h1>Change your password</h1>
        <p>This is your first login. Please set a new password to continue.</p>

        <form onSubmit={handlePasswordChange}>
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />

          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button type="submit">
            Save new password
          </button>
        </form>

        {message && <p>{message}</p>}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '50px auto' }}>
      <h1>The Formby Commons</h1>

      <p>
        Logged in as: {session.user.email}
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <button onClick={handleLogout} style={{ marginRight: '8px' }}>
          Sign Out
        </button>

        <button
          onClick={() => setActiveView('chat')}
          style={{ marginRight: '8px' }}
        >
          Chat
        </button>

        {profile?.is_admin && (
          <button onClick={() => setActiveView('admin')}>
            Admin
          </button>
        )}
      </div>

      <hr />

      {activeView === 'chat' && (
        <>
          <h2>Account</h2>

          <form onSubmit={handlePasswordChange}>
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />

            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <button type="submit">
              Change Password
            </button>
          </form>

          <hr />

          <h2>Rooms</h2>

          {profile?.is_admin && (
            <>
              <h3>Create Room</h3>

              <form onSubmit={handleCreateRoom}>
                <input
                  type="text"
                  placeholder="Room name"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                />

                <br />
                <br />

                <textarea
                  rows="3"
                  style={{ width: '100%' }}
                  placeholder="Room description"
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                />

                <br />

                <button type="submit">
                  Create Room
                </button>
              </form>

              <hr />
            </>
          )}

          {rooms.map((room) => (
            <div key={room.id} style={{ marginBottom: '10px' }}>
              <button
                onClick={() => selectRoom(room)}
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight:
                    selectedRoom?.id === room.id
                      ? 'bold'
                      : 'normal',
                }}
              >
                {room.name}
              </button>

              {profile?.is_admin && (
                <button onClick={() => handleDeleteRoom(room.id)}>
                  Delete room
                </button>
              )}
            </div>
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
        </>
      )}

      {activeView === 'admin' && profile?.is_admin && (
        <div>
          <h2>Admin panel</h2>
          <p>Manage members, rooms, and messages.</p>

          <h3>Members</h3>
          {memberList.length === 0 && <p>No members found.</p>}

          {memberList.map(member => (
            <div
              key={member.id}
              style={{
                border: '1px solid #ddd',
                padding: '12px',
                marginBottom: '12px',
                borderRadius: '6px',
              }}
            >
              <strong>{member.display_name || member.email}</strong>
              <div>{member.email}</div>

              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleMemberToggleAdmin(member.id, !member.is_admin)}
                  style={{ marginRight: '8px' }}
                >
                  {member.is_admin ? 'Remove admin' : 'Make admin'}
                </button>

                <button
                  type="button"
                  onClick={() => handleMemberDelete(member.id)}
                  style={{ marginRight: '8px' }}
                >
                  Delete member
                </button>
              </div>
            </div>
          ))}

          <h3>Rooms</h3>
          {rooms.length === 0 && <p>No rooms available.</p>}
          {rooms.map(room => (
            <div key={room.id} style={{ marginBottom: '8px' }}>
              <strong>{room.name}</strong>
              <div>{room.description}</div>
              <button onClick={() => handleDeleteRoom(room.id)}>
                Delete room
              </button>
            </div>
          ))}

          <h3>Messages</h3>
          {messages.length === 0 && <p>No messages loaded in the current room.</p>}
          {messages.map(messageItem => (
            <div key={messageItem.id} style={{ marginBottom: '8px' }}>
              <strong>{profiles[messageItem.author_id] || 'Unknown'}</strong>
              <div>{messageItem.body}</div>
              <button onClick={() => handleDeleteMessage(messageItem.id)}>
                Delete message
              </button>
            </div>
          ))}
        </div>
      )}

      {message && (
        <p>{message}</p>
      )}
    </div>
  )
}

export default App
