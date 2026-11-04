import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const emptyResource = { title: '', url: '', description: '' }

function EventsApp() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [events, setEvents] = useState([])
  const [resources, setResources] = useState([])
  const [resourceForm, setResourceForm] = useState(emptyResource)
  const [editingResourceId, setEditingResourceId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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
      if (data?.status === 'active' && !data.must_change_password) await loadContent()
      if (mounted) setLoading(false)
    }
    initialize()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  async function loadContent() {
    const [eventsResult, resourcesResult] = await Promise.all([
      supabase.from('community_events')
        .select('id, title, description, starts_at, ends_at, location')
        .gte('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('starts_at'),
      supabase.from('community_resources')
        .select('id, title, url, description, created_at, updated_at')
        .order('title'),
    ])
    const failed = [eventsResult, resourcesResult].find(result => result.error)
    if (failed) setError(failed.error.message)
    else {
      setEvents(eventsResult.data || [])
      setResources(resourcesResult.data || [])
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setSession(null)
    setMembership(null)
    setEvents([])
    setResources([])
  }

  function downloadCalendarEvent(event) {
    const formatDate = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const escapeText = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
    const endValue = event.ends_at || new Date(new Date(event.starts_at).getTime() + 60 * 60 * 1000).toISOString()
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Formby Commons//Community Events//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${event.id}@theformbycommons`,
      `DTSTAMP:${formatDate(new Date().toISOString())}`, `DTSTART:${formatDate(event.starts_at)}`,
      `DTEND:${formatDate(endValue)}`, `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
      'END:VEVENT', 'END:VCALENDAR', '',
    ]
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'community-event'}.ics`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function isSafeResourceUrl(value) {
    try { return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol) }
    catch { return false }
  }

  async function saveResource(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    const values = {
      title: resourceForm.title.trim(),
      url: resourceForm.url.trim(),
      description: resourceForm.description.trim(),
    }
    if (!values.title || !values.description || !isSafeResourceUrl(values.url)) {
      setError('Enter a title, description, and a valid http(s) or mailto link.')
      return
    }
    const query = editingResourceId
      ? supabase.from('community_resources').update(values).eq('id', editingResourceId)
      : supabase.from('community_resources').insert(values)
    const { error: saveError } = await query
    if (saveError) { setError(saveError.message); return }
    setResourceForm(emptyResource)
    setEditingResourceId(null)
    setNotice('Resource saved.')
    await loadContent()
  }

  async function deleteResource(resource) {
    if (!window.confirm(`Remove “${resource.title}” from community resources?`)) return
    const { error: deleteError } = await supabase.from('community_resources').delete().eq('id', resource.id)
    if (deleteError) setError(deleteError.message)
    else { setNotice('Resource removed.'); await loadContent() }
  }

  if (loading) return <main className="community-app"><p>Loading community links and calendar…</p></main>
  if (!session) return <main className="login-container">
    <h1>Community links &amp; calendar</h1>
    <p>Sign in with an active community account to view resources and events.</p>
    {error && <p role="alert">{error}</p>}
    <a href="./">Sign in to the member site</a>
  </main>
  if (!membership || membership.status !== 'active' || membership.must_change_password) return <main className="login-container">
    <h1>Community links &amp; calendar</h1>
    <p>An active community membership with completed password setup is required.</p>
    <button onClick={logout}>Sign out</button>
  </main>

  const isAdmin = membership.role === 'administrator'
  return <main className="community-app">
    <header>
      <h1>Community links &amp; calendar</h1>
      <p>Useful community resources and upcoming events in one place.</p>
      <nav><a href="./">Member site</a>{' · '}<button type="button" onClick={logout}>Sign out</button></nav>
    </header>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}

    <section aria-labelledby="events-title">
      <h2 id="events-title">Upcoming events</h2>
      {events.length === 0 && <p>No upcoming events are scheduled yet.</p>}
      {events.map(event => <article className="admin-card event-card" key={event.id}>
        <h3>{event.title}</h3>
        <p><strong>{new Date(event.starts_at).toLocaleString('en-GB')}{event.ends_at ? ` – ${new Date(event.ends_at).toLocaleString('en-GB')}` : ''}</strong></p>
        {event.location && <p><strong>Location:</strong> {event.location}</p>}
        {event.description && <p className="event-description">{event.description}</p>}
        <button className="calendar-download-button" type="button" onClick={() => downloadCalendarEvent(event)}>
          Add to phone or computer calendar (.ics)
        </button>
      </article>)}
    </section>

    <section aria-labelledby="resources-title" className="combined-resources-section">
      <h2 id="resources-title">Community resources</h2>
      <p>Useful links and ways to get in touch with The Formby Commons.</p>
      {isAdmin && <form className="admin-card" onSubmit={saveResource}>
        <h3>{editingResourceId ? 'Edit resource' : 'Add a resource'}</h3>
        <label>Title<input required maxLength="120" value={resourceForm.title} onChange={event => setResourceForm({ ...resourceForm, title: event.target.value })} /></label>
        <label>Link<input required type="text" placeholder="https://… or mailto:…" value={resourceForm.url} onChange={event => setResourceForm({ ...resourceForm, url: event.target.value })} /></label>
        <label>Short description<textarea required maxLength="500" rows="3" value={resourceForm.description} onChange={event => setResourceForm({ ...resourceForm, description: event.target.value })} /></label>
        <button type="submit">{editingResourceId ? 'Save changes' : 'Add resource'}</button>
        {editingResourceId && <button type="button" onClick={() => { setEditingResourceId(null); setResourceForm(emptyResource) }}>Cancel</button>}
      </form>}
      {resources.length === 0 && <p>No resources have been added yet.</p>}
      {resources.map(resource => <article className="admin-card resource-card" key={resource.id}>
        <h3><a href={resource.url} target={resource.url.startsWith('mailto:') ? undefined : '_blank'} rel={resource.url.startsWith('mailto:') ? undefined : 'noreferrer'}>{resource.title}</a></h3>
        <p>{resource.description}</p>
        {isAdmin && <div>
          <button type="button" onClick={() => { setEditingResourceId(resource.id); setResourceForm({ title: resource.title, url: resource.url, description: resource.description }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
          <button type="button" onClick={() => deleteResource(resource)}>Remove</button>
        </div>}
      </article>)}
    </section>

    <footer className="site-footer">
      <a href="./">Back to the community platform</a>
      <div>© 2026 The Formby Commons</div>
    </footer>
  </main>
}

export default EventsApp
