import { useCallback, useEffect, useState } from 'react'
import { Check, PauseCircle, PlayCircle } from 'lucide-react'
import { formatDateTime } from '../../lib/format'
import { fetchCoachingApplications, placeName, setCoachingStatus } from '../../lib/coaching'

const STATUS_TONE = { pending: 'tone-mid', approved: 'tone-great', suspended: 'tone-low' }

// Coaching applications: approve new ones, pause or restore existing ones.
export function Coachings({ onChange }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    fetchCoachingApplications().then(setList).catch((e) => { setList([]); setError(e.message) })
  }, [])
  useEffect(() => { load() }, [load])

  const set = async (c, status) => {
    setBusyId(c.id)
    setError('')
    try {
      await setCoachingStatus(c.id, status)
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
      {list.length === 0 && <p className="muted">No coaching has applied yet. Coachings pick Teacher on the login screen and apply from there.</p>}
      <ul className="admin-report-list">
        {list.map((c) => (
          <li key={c.id} className="card admin-coaching">
            <div className="admin-coaching-head">
              <b>{c.name}</b>
              <span className={`pill ${STATUS_TONE[c.status]}`}>{c.status}</span>
            </div>
            <p className="muted small">
              {[placeName(c), c.owner_email, c.phone].filter(Boolean).join(' · ')}
              <br />Applied {formatDateTime(c.created_at)} · {c.series} series · {c.students} students
              {c.commission_pct != null && <> · Fedge fee {Number(c.commission_pct)}%</>}
            </p>
            {c.about && <p className="small">{c.about}</p>}
            <div className="admin-actions">
              {c.status !== 'approved' && (
                <button type="button" className="btn small primary" disabled={busyId === c.id} onClick={() => set(c, 'approved')}>
                  {c.status === 'pending' ? <><Check size={14} /> Approve</> : <><PlayCircle size={14} /> Restore</>}
                </button>
              )}
              {c.status === 'approved' && (
                <button type="button" className="btn small danger" disabled={busyId === c.id} onClick={() => set(c, 'suspended')}><PauseCircle size={14} /> Pause</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
