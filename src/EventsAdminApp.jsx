import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const blankEvent = { title: '', description: '', starts_at: '', ends_at: '', location: '' }

function EventsAdminApp() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [rooms, setRooms] = useState([])
  const [events, setEvents] = useState([])
  const [eventForm, setEventForm] = useState(blankEvent)
  const [editingEventId, setEditingEventId] = useState(null)
  const [roomId, setRoomId] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    async function initialize() {
      const { data: { session: current } } = await supabase.auth.getSession()
      if (!alive) return
      setSession(current)
      if (!current) { setLoading(false); return }
      const { data, error: membershipError } = await supabase.from('memberships')
        .select('role, status, must_change_password').eq('user_id', current.user.id).maybeSingle()
      if (!alive) return
      if (membershipError) setError(membershipError.message)
      setMembership(data || null)
      if (data?.role === 'administrator' && data.status === 'active' && !data.must_change_password) await refreshData()
      if (alive) setLoading(false)
    }
    initialize()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => { alive = false; subscription.unsubscribe() }
  }, [])

  async function refreshData() {
    const [roomResult, eventResult] = await Promise.all([
      supabase.from('rooms').select('id, name').order('name'),
      supabase.from('community_events').select('*').order('starts_at'),
    ])
    const failed = [roomResult, eventResult].find(result => result.error)
    if (failed) setError(failed.error.message)
    else { setRooms(roomResult.data || []); setEvents(eventResult.data || []) }
  }

  async function saveEvent(event) {
    event.preventDefault()
    setError(''); setNotice('')
    if (!eventForm.title.trim() || !eventForm.starts_at) { setError('Enter an event title and start date/time.'); return }
    if (eventForm.ends_at && new Date(eventForm.ends_at) < new Date(eventForm.starts_at)) { setError('The event end must be after its start.'); return }
    const values = {
      title: eventForm.title.trim(), description: eventForm.description.trim(),
      starts_at: new Date(eventForm.starts_at).toISOString(),
      ends_at: eventForm.ends_at ? new Date(eventForm.ends_at).toISOString() : null,
      location: eventForm.location.trim() || null,
    }
    const query = editingEventId
      ? supabase.from('community_events').update(values).eq('id', editingEventId)
      : supabase.from('community_events').insert({ ...values, created_by: session.user.id })
    const { error: saveError } = await query
    if (saveError) { setError(saveError.message); return }
    setEventForm(blankEvent); setEditingEventId(null); setNotice('Event saved.')
    await refreshData()
  }

  async function deleteEvent(item) {
    if (!window.confirm(`Delete “${item.title}”?`)) return
    const { error: deleteError } = await supabase.from('community_events').delete().eq('id', item.id)
    if (deleteError) setError(deleteError.message)
    else { setNotice('Event deleted.'); await refreshData() }
  }

  async function exportMessages(event) {
    event.preventDefault()
    setError(''); setNotice('')
    if (!fromDate || !toDate || fromDate > toDate) { setError('Choose a valid start and end date.'); return }
    if (!window.confirm(`Create a DOCX export for ${roomId === 'all' ? 'all rooms' : rooms.find(room => room.id === roomId)?.name}, from ${fromDate} to ${toDate}${includeDeleted ? ', including deleted messages' : ''}?`)) return
    setBusy(true)
    try {
      const start = new Date(`${fromDate}T00:00:00`).toISOString()
      const endExclusive = new Date(new Date(`${toDate}T00:00:00`).getTime() + 86400000).toISOString()
      let allMessages = []
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        let query = supabase.from('messages')
          .select('id, room_id, author_id, body, parent_id, root_id, created_at, deleted_at')
          .gte('created_at', start).lt('created_at', endExclusive)
          .order('created_at', { ascending: true }).range(offset, offset + pageSize - 1)
        if (roomId !== 'all') query = query.eq('room_id', roomId)
        if (!includeDeleted) query = query.is('deleted_at', null)
        const { data, error: queryError } = await query
        if (queryError) throw queryError
        allMessages = allMessages.concat(data || [])
        if (!data || data.length < pageSize) break
      }
      if (!allMessages.length) { setNotice('No messages matched those filters.'); return }
      const roomNames = Object.fromEntries(rooms.map(room => [room.id, room.name]))
      await downloadDocx(allMessages, {
        roomLabel: roomId === 'all' ? 'All rooms' : (roomNames[roomId] || 'Selected room'),
        fromDate, toDate, includeDeleted,
      })
      setNotice(`Downloaded DOCX containing ${allMessages.length} message${allMessages.length === 1 ? '' : 's'}.`)
    } catch (exportError) {
      setError(exportError.message || 'Could not export messages.')
    } finally { setBusy(false) }
  }

  async function logout() {
    await supabase.auth.signOut()
    setSession(null); setMembership(null); setRooms([]); setEvents([])
  }

  if (loading) return <main className="community-app"><p>Checking administrator access…</p></main>
  if (!session) return <main className="login-container"><h1>Events and export administration</h1><p>Sign in with an administrator account.</p><a href="./admin.html">Go to admin sign in</a></main>
  if (!membership || membership.status !== 'active' || membership.role !== 'administrator' || membership.must_change_password) return <main className="login-container"><h1>Administrator access required</h1><p>This area is only available to administrators with completed password setup.</p><button onClick={logout}>Sign out</button></main>

  return <main className="community-app">
    <header><h1>Events and message export</h1><p>Administrator tools</p><nav><a href="./admin.html">Main admin panel</a>{' · '}<a href="./">Member site</a>{' · '}<button onClick={logout}>Sign out</button></nav></header>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}

    <section><h2>Community events</h2>
      <form className="admin-card" onSubmit={saveEvent}>
        <h3>{editingEventId ? 'Edit event' : 'Add an event'}</h3>
        <label>Event title<input required maxLength="160" value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} /></label>
        <label>Description<textarea maxLength="3000" rows="4" value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} /></label>
        <label>Starts<input required type="datetime-local" value={eventForm.starts_at} onChange={e => setEventForm({ ...eventForm, starts_at: e.target.value })} /></label>
        <label>Ends (optional)<input type="datetime-local" value={eventForm.ends_at} onChange={e => setEventForm({ ...eventForm, ends_at: e.target.value })} /></label>
        <label>Location or online link<input maxLength="300" value={eventForm.location} onChange={e => setEventForm({ ...eventForm, location: e.target.value })} /></label>
        <button type="submit">{editingEventId ? 'Save event' : 'Add event'}</button>
        {editingEventId && <button type="button" onClick={() => { setEditingEventId(null); setEventForm(blankEvent) }}>Cancel</button>}
      </form>
      {events.map(item => <article className="admin-card" key={item.id}>
        <h3>{item.title}</h3><p>{new Date(item.starts_at).toLocaleString('en-GB')}</p>
        {item.location && <p>{item.location}</p>}
        <button type="button" onClick={() => { setEditingEventId(item.id); setEventForm({ title: item.title, description: item.description || '', starts_at: toLocalInput(item.starts_at), ends_at: toLocalInput(item.ends_at), location: item.location || '' }) }}>Edit</button>
        <button type="button" onClick={() => deleteEvent(item)}>Delete</button>
      </article>)}
      {events.length === 0 && <p>No events yet.</p>}
    </section>

    <section><h2>Export messages to DOCX</h2>
      <p>Downloads a readable Word document. Only messages visible to your authenticated administrator account are included. Soft-deleted messages are excluded by default.</p>
      <form className="admin-card" onSubmit={exportMessages}>
        <label>Room<select value={roomId} onChange={e => setRoomId(e.target.value)}><option value="all">All rooms</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        <label>From date<input type="date" required value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
        <label>To date (inclusive)<input type="date" required value={toDate} onChange={e => setToDate(e.target.value)} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />Include soft-deleted messages</label>
        <button type="submit" disabled={busy}>{busy ? 'Preparing document…' : 'Download DOCX'}</button>
      </form>
    </section>
    <footer className="site-footer">© 2026 The Formby Commons</footer>
  </main>
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function xmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function docxParagraph(text, style = '', bold = false) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''
  const boldXml = bold ? '<w:rPr><w:b/></w:rPr>' : ''
  return `<w:p>${styleXml}<w:r>${boldXml}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`
}

async function downloadDocx(messages, filters) {
  const paragraphs = [
    docxParagraph('The Formby Commons — Message Export', 'Title'),
    docxParagraph(`Room: ${filters.roomLabel}`),
    docxParagraph(`Date range: ${filters.fromDate} to ${filters.toDate} (inclusive)`),
    docxParagraph(`Exported: ${new Date().toLocaleString('en-GB')}`),
    docxParagraph(`Soft-deleted messages included: ${filters.includeDeleted ? 'Yes' : 'No'}`),
    docxParagraph(`${messages.length} message${messages.length === 1 ? '' : 's'}`),
    docxParagraph(''),
  ]
  for (const [index, item] of messages.entries()) {
    const roomName = filters.roomLabel === 'All rooms' ? '' : ` · ${filters.roomLabel}`
    paragraphs.push(docxParagraph(`${index + 1}. ${new Date(item.created_at).toLocaleString('en-GB')}${roomName}`, 'Heading2', true))
    paragraphs.push(docxParagraph(`Author ID: ${item.author_id || 'Unknown'}${item.parent_id ? ` · Reply to: ${item.parent_id}` : ' · Thread starter'}${item.deleted_at ? ' · Soft-deleted' : ''}`))
    paragraphs.push(docxParagraph(item.body || '[Empty message]'))
    paragraphs.push(docxParagraph(''))
  }
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>'
  const files = [
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', text: documentXml },
    { name: 'word/_rels/document.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'word/styles.xml', text: stylesXml },
  ]
  const blob = new Blob([makeZip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `commons-messages-${filters.fromDate}-to-${filters.toDate}.docx`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function makeZip(files) {
  const encoder = new TextEncoder()
  const entries = files.map(file => ({ name: encoder.encode(file.name), data: encoder.encode(file.text) }))
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
  const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }
  const chunks = []; const central = []; let offset = 0
  const write16 = (view, position, value) => view.setUint16(position, value, true)
  const write32 = (view, position, value) => view.setUint32(position, value >>> 0, true)
  for (const entry of entries) {
    const crc = crc32(entry.data)
    const local = new Uint8Array(30 + entry.name.length); const lv = new DataView(local.buffer)
    write32(lv, 0, 0x04034b50); write16(lv, 4, 20); write16(lv, 6, 0x0800); write16(lv, 8, 0); write32(lv, 14, crc); write32(lv, 18, entry.data.length); write32(lv, 22, entry.data.length); write16(lv, 26, entry.name.length); write16(lv, 28, 0); local.set(entry.name, 30)
    chunks.push(local, entry.data)
    const dir = new Uint8Array(46 + entry.name.length); const dv = new DataView(dir.buffer)
    write32(dv, 0, 0x02014b50); write16(dv, 4, 20); write16(dv, 6, 20); write16(dv, 8, 0x0800); write16(dv, 10, 0); write32(dv, 16, crc); write32(dv, 20, entry.data.length); write32(dv, 24, entry.data.length); write16(dv, 28, entry.name.length); write16(dv, 30, 0); write16(dv, 32, 0); write16(dv, 34, 0); write16(dv, 36, 0); write32(dv, 38, 0); write32(dv, 42, offset); dir.set(entry.name, 46)
    central.push(dir); offset += local.length + entry.data.length
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0)
  const end = new Uint8Array(22); const ev = new DataView(end.buffer)
  write32(ev, 0, 0x06054b50); write16(ev, 4, 0); write16(ev, 6, 0); write16(ev, 8, entries.length); write16(ev, 10, entries.length); write32(ev, 12, centralSize); write32(ev, 16, offset); write16(ev, 20, 0)
  return new Blob([...chunks, ...central, end], { type: 'application/zip' })
}

export default EventsAdminApp
