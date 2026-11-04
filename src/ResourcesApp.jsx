import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const emptyForm = { title: '', url: '', description: '' }

function ResourcesApp() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [resources, setResources] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let mounted = true
    async function initialize() {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(currentSession)
      if (!currentSession) {
        setLoading(false)
        return
      }
      const { data, error } = await supabase.from('memberships')
        .select('role, status, must_change_password')
        .eq('user_id', currentSession.user.id)
        .maybeSingle()
      if (!mounted) return
      if (error) setErrorMessage(error.message)
      setMembership(data || null)
      if (data?.status === 'active' && !data.must_change_password) await loadResources()
      if (mounted) setLoading(false)
    }
    initialize()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setMembership(null)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  async function loadResources() {
    const { data, error } = await supabase.from('community_resources')
      .select('id, title, url, description, created_at, updated_at')
      .order('title')
    if (error) setErrorMessage(error.message)
    else setResources(data || [])
  }

  function safeLink(value) {
    try {
      const url = new URL(value)
      return ['https:', 'http:', 'mailto:'].includes(url.protocol)
    } catch {
      return false
    }
  }

  async function saveResource(event) {
    event.preventDefault()
    setErrorMessage('')
    setNotice('')
    const values = {
      title: form.title.trim(),
      url: form.url.trim(),
      description: form.description.trim(),
    }
    if (!values.title || !values.description || !safeLink(values.url)) {
      setErrorMessage('Enter a title, description, and a valid http(s) or mailto link.')
      return
    }
    const query = editingId
      ? supabase.from('community_resources').update(values).eq('id', editingId)
      : supabase.from('community_resources').insert(values)
    const { error } = await query
    if (error) {
      setErrorMessage(error.message)
      return
    }
    setForm(emptyForm)
    setEditingId(null)
    setNotice('Resource saved.')
    await loadResources()
  }

  async function removeResource(resource) {
    if (!window.confirm(`Remove “${resource.title}” from community resources?`)) return
    const { error } = await supabase.from('community_resources').delete().eq('id', resource.id)
    if (error) setErrorMessage(error.message)
    else {
      setNotice('Resource removed.')
      await loadResources()
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setSession(null)
    setMembership(null)
    setResources([])
  }

  if (loading) return <main className="community-app"><p>Loading resources…</p></main>
  if (!session) return <main className="login-container">
    <h1>Community resources</h1>
    <p>Sign in with an active community account to view these links.</p>
    {errorMessage && <p role="alert">{errorMessage}</p>}
    <a href="./">Sign in to the member site</a>
  </main>
  if (!membership || membership.status !== 'active' || membership.must_change_password) return <main className="login-container">
    <h1>Community resources</h1>
    <p>An active community membership with a completed password setup is required.</p>
    <button onClick={logout}>Sign out</button>
  </main>

  const isAdmin = membership.role === 'administrator'
  return <main className="community-app">
    <header>
      <h1>Community resources</h1>
      <p>Useful links and ways to get in touch with The Formby Commons.</p>
      <nav><a href="./">Member site</a>{' · '}<button type="button" onClick={logout}>Sign out</button></nav>
    </header>
    {errorMessage && <p role="alert">{errorMessage}</p>}
    {notice && <p role="status">{notice}</p>}

    {isAdmin && <section className="admin-card">
      <h2>{editingId ? 'Edit resource' : 'Add a resource'}</h2>
      <form onSubmit={saveResource}>
        <label>Title<input required maxLength="120" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label>Link<input required type="text" placeholder="https://… or mailto:…" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} /></label>
        <label>Short description<textarea required maxLength="500" rows="3" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        <button type="submit">{editingId ? 'Save changes' : 'Add resource'}</button>
        {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm) }}>Cancel</button>}
      </form>
    </section>}

    <section aria-labelledby="resource-list-title">
      <h2 id="resource-list-title">Useful links</h2>
      {resources.length === 0 && <p>No resources have been added yet.</p>}
      {resources.map(resource => <article className="admin-card resource-card" key={resource.id}>
        <h3><a href={resource.url} target={resource.url.startsWith('mailto:') ? undefined : '_blank'} rel={resource.url.startsWith('mailto:') ? undefined : 'noreferrer'}>{resource.title}</a></h3>
        <p>{resource.description}</p>
        {isAdmin && <div>
          <button type="button" onClick={() => { setEditingId(resource.id); setForm({ title: resource.title, url: resource.url, description: resource.description }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
          <button type="button" onClick={() => removeResource(resource)}>Remove</button>
        </div>}
      </article>)}
    </section>
    <footer className="site-footer">© 2026 The Formby Commons</footer>
  </main>
}

export default ResourcesApp
