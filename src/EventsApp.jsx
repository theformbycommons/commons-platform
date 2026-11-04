import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function EventsApp() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function initialize() {
      const { data: { session: current } } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(current)
      if (!current) { setLoading(false); return }
      const { data, error: membershipError } = await supabase.from('memberships')
        .select('role, status, must_change_password')
        .eq('user_id', current.user.id).maybeSingle()
      if (!mounted) return
      if (membershipError) setError(membershipError.message)
      setMembership(data || null)
      if (data?.status === 'active' && !data.must_change_password) await loadEvents()
      if (mounted) setLoading(false)
    }
    initialize()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  async function loadEvents() {
    const { data, error: queryError } = await supabase.from('community_events')
      .select('id, title, description, starts_at, ends_at, location, created_at')
      .gte('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('starts_at')
    if (queryError) setError(queryError.message)
    else setEvents(data || [])
  }

  async function logout() {
    await supabase.auth.signOut()
    setSession(null)
    setMembership(null)
    setEvents([])
  }

  function downloadCalendarEvent(event) {
    const formatDate = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const escapeText = value => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Formby Commons//Community Events//EN',
      'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${event.id}@theformbycommons`,
      `DTSTAMP:${formatDate(new Date().toISOString())}`, `DTSTART:${formatDate(event.starts_at)}`,
      `DTEND:${formatDate(event.ends_at || event.starts_at)}`, `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
      'END:VEVENT', 'END:VCALENDAR', '',
    ]
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'community-event'}.ics`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <main className="community-app"><p>Loading events…</p></main>
  if (!session) return <main className="login-container"><h1>Community events</h1><p>Sign in with an active community account to view events.</p><a href="./">Sign in to the member site</a></main>
  if (!membership || membership.status !== 'active' || membership.must_change_password) return <main className="login-container"><h1>Community events</h1><p>An active community membership with completed password setup is required.</p><button onClick={logout}>Sign out</button></main>

  return <main className="community-app">
    <header><h1>Community events</h1><p>Upcoming events from The Formby Commons.</p><nav><a href="./">Member site</a>{' · '}<a href="./resources.html">Resources</a>{' · '}<button onClick={logout}>Sign out</button></nav></header>
    {error && <p role="alert">{error}</p>}
    {events.length === 0 && <p>No upcoming events are scheduled yet.</p>}
    {events.map(event => <article className="admin-card event-card" key={event.id}>
      <h2>{event.title}</h2>
      <p><strong>{new Date(event.starts_at).toLocaleString('en-GB')}{event.ends_at ? ` – ${new Date(event.ends_at).toLocaleString('en-GB')}` : ''}</strong></p>
      {event.location && <p><strong>Location:</strong> {event.location}</p>}
      {event.description && <p className="event-description">{event.description}</p>}
      <button type="button" onClick={() => downloadCalendarEvent(event)}>Add to calendar (.ics)</button>
    </article>)}
    <footer className="site-footer">© 2026 The Formby Commons</footer>
  </main>
}

export default EventsApp
