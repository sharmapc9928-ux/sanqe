import { useCallback, useEffect, useState } from 'react'
import { CheckCheck, Flag, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { QuestionBody } from '../Question'
import { RichText } from '../RichText'
import { REPORT_REASONS } from '../ReportQuestion'
import { deleteReports, fetchReports, setReportsStatus } from '../../lib/admin'
import { formatDateTime } from '../../lib/format'
import { TOPIC_BY_KEY } from '../../lib/syllabus'

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label]))

// Student reports, one card per question. "Edit question" opens it in the
// Add / Edit tab; "Mark fixed" closes every open report on that question.
export function Reports({ onEdit, onChange }) {
  const [status, setStatus] = useState('open')
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState(null)

  const load = useCallback(async () => {
    setError('')
    try {
      setGroups(await fetchReports(status))
    } catch (e) {
      setGroups([])
      setError(e.message)
    }
  }, [status])
  useEffect(() => { setGroups(null); load() }, [load])

  const act = async (group, fn) => {
    setBusyKey(group.key)
    setError('')
    try {
      await fn(group.reports.map((r) => r.id))
      await load()
      onChange?.()
    } catch (e) {
      setError(e.message)
    }
    setBusyKey(null)
  }

  return (
    <div className="admin-reports">
      <div className="admin-toolbar">
        <div className="segmented" role="radiogroup" aria-label="Report status">
          {[{ key: 'open', label: 'Open' }, { key: 'resolved', label: 'Fixed' }].map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={status === s.key} className={status === s.key ? 'active' : ''} onClick={() => setStatus(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="muted small">Students report wrong answers, typos and missing pictures from any question.</span>
      </div>

      {error && <p className="error">{error}</p>}
      {groups === null ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : groups.length === 0 ? (
        <div className="empty-state card">
          <span className="empty-icon"><Flag size={22} /></span>
          <h3>{status === 'open' ? 'No open reports' : 'Nothing fixed yet'}</h3>
          <p>{status === 'open' ? 'When a student reports a question it shows up here.' : 'Reports you mark as fixed are kept here.'}</p>
        </div>
      ) : (
        <ul className="admin-report-list">
          {groups.map((g) => {
            const topic = TOPIC_BY_KEY[g.topic]
            const q = g.question
            const counts = {}
            g.reports.forEach((r) => { counts[r.reason] = (counts[r.reason] || 0) + 1 })
            const notes = g.reports.filter((r) => r.note)
            const busy = busyKey === g.key
            return (
              <li key={g.key} className="card admin-report">
                <div className="review-head">
                  <span className={`pill hue-${topic?.hue}`}>{topic?.short || g.topic}</span>
                  <span className="review-num">#{g.questionId}</span>
                  <span className="admin-report-count">{g.reports.length} report{g.reports.length === 1 ? '' : 's'}</span>
                  <span className="muted small">{formatDateTime(g.latest)}</span>
                </div>

                {q ? (
                  <>
                    <QuestionBody question={q} compact />
                    <p className="review-answers"><span className="ok">Answer key: ({q.correct_option.toUpperCase()}) <RichText text={q[`option_${q.correct_option}`]} /></span></p>
                  </>
                ) : (
                  <p className="muted">This question has been deleted.</p>
                )}

                <div className="admin-report-reasons">
                  {Object.entries(counts).map(([reason, n]) => (
                    <span key={reason} className="admin-reason-chip">{REASON_LABEL[reason] || reason}{n > 1 ? ` ×${n}` : ''}</span>
                  ))}
                </div>
                {notes.length > 0 && (
                  <ul className="admin-report-notes">
                    {notes.map((r) => <li key={r.id}>“{r.note}”</li>)}
                  </ul>
                )}

                <div className="admin-actions">
                  {q && topic && (
                    <button type="button" className="btn small" onClick={() => onEdit(g.topic, q)} disabled={busy}>
                      <Pencil size={14} /> Edit question
                    </button>
                  )}
                  {status === 'open' ? (
                    <button type="button" className="btn small primary" onClick={() => act(g, (ids) => setReportsStatus(ids, 'resolved'))} disabled={busy}>
                      <CheckCheck size={14} /> Mark fixed
                    </button>
                  ) : (
                    <button type="button" className="btn small" onClick={() => act(g, (ids) => setReportsStatus(ids, 'open'))} disabled={busy}>
                      <RotateCcw size={14} /> Reopen
                    </button>
                  )}
                  {(status === 'resolved' || !q) && (
                    <button type="button" className="btn small danger" onClick={() => act(g, deleteReports)} disabled={busy}>
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
