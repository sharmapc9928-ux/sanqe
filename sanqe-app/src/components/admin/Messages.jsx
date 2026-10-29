import { useCallback, useEffect, useState } from 'react'
import { Check, Mail, RotateCcw } from 'lucide-react'
import { formatDateTime } from '../../lib/format'
import { CONTACT_TOPICS, fetchContactMessages, setMessageHandled } from '../../lib/contact'

const TOPIC_LABEL = Object.fromEntries(CONTACT_TOPICS.map((t) => [t.key, t.label]))

// Messages from the contact form (/contact): reply by email, then mark handled.
export function Messages({ onChange }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    fetchContactMessages().then(setList).catch((e) => { setList([]); setError(e.message) })
  }, [])
  useEffect(() => { load() }, [load])

  const mark = async (m, handled) => {
    setBusyId(m.id)
    setError('')
    try {
      await setMessageHandled(m.id, handled)
      load()
      onChange?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  if (list === null) return <div className="skeleton" style={{ height: 160 }} />
  return (
    <section>
      {error && <p className="error" role="alert">{error}</p>}
      {list.length === 0 && <p className="muted">No messages yet. The contact form is at /contact.</p>}
      <ul className="admin-report-list">
        {list.map((m) => (
          <li key={m.id} className={`card admin-coaching${m.handled ? ' admin-message-done' : ''}`}>
            <div className="admin-coaching-head">
              <b>{m.name}</b>
              <span className={`pill ${m.handled ? 'tone-great' : 'tone-mid'}`}>{m.handled ? 'handled' : 'new'}</span>
            </div>
            <p className="muted small">
              {[TOPIC_LABEL[m.topic] || m.topic, m.email, m.phone].filter(Boolean).join(' · ')}
              <br />{formatDateTime(m.created_at)}{m.user_id ? ' · has an account' : ''}
            </p>
            <p className="small admin-message-text">{m.message}</p>
            <div className="admin-actions">
              <a className="btn small" href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to Fedge Sanqe')}`}><Mail size={14} /> Reply</a>
              {m.handled
                ? <button type="button" className="btn small" disabled={busyId === m.id} onClick={() => mark(m, false)}><RotateCcw size={14} /> Mark new</button>
                : <button type="button" className="btn small primary" disabled={busyId === m.id} onClick={() => mark(m, true)}><Check size={14} /> Mark handled</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
