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
  const [profiles, setProfiles] = useState({})

  const [newMessage, setNewMessage] = useState('')

  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')

  const [collapsedThreads, setCollapsedThreads] = useState({})

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

      ;(profileData || []).forEach(profile => {
        profileMap[profile.id] = profile.display_name
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
    setProfiles({})
    setCollapsedThreads({})
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

  function countReplies(messageId) {
    const directReplies = getReplies(messageId)

    return directReplies.reduce(
      (total, reply) =>
        total + 1 + countReplies(reply
