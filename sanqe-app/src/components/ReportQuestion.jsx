import { useContext, useState } from 'react'
import { Check, Flag } from 'lucide-react'
import { Modal } from './ui'
import { reportQuestion } from '../lib/api'
import { AppContext } from '../lib/appContext'

export const REPORT_REASONS = [
  { key: 'wrong_answer', label: 'The answer key is wrong' },
  { key: 'typo', label: 'Typo or missing text' },
  { key: 'unclear', label: 'The question is unclear' },
  { key: 'picture', label: 'Picture is missing or wrong' },
  { key: 'other', label: 'Something else' },
]

// Small "Report" link + dialog. One report per student per question; the
// admin sees it under Question admin → Reports.
export function ReportQuestion({ topic, questionId }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | already
  const [error, setError] = useState('')
  const guest = !!useContext(AppContext)?.guest

  // Reports are tied to an account, so logged-out practice doesn't offer it.
  if (!topic || !questionId || guest) return null
  const done = status === 'sent' || status === 'already'

  const submit = async () => {
    if (!reason || status === 'sending') return
    setStatus('sending')
    setError('')
    try {
      setStatus(await reportQuestion({ topic, questionId, reason, note }))
      setOpen(false)
    } catch (e) {
      setError(e.message)
      setStatus('idle')
    }
  }

  return (
    <>
      <button type="button" className="link-btn small report-link" onClick={() => setOpen(true)} disabled={done}>
        {done ? <Check size={13} /> : <Flag size={13} />}
        {status === 'sent' ? 'Reported, thanks!' : status === 'already' ? 'Already reported' : 'Report'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Report this question"
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn primary" onClick={submit} disabled={!reason || status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send report'}
            </button>
          </>
        )}
      >
        <p>What&apos;s wrong with it? We check every report and fix the question.</p>
        <div className="report-reasons" role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map((r) => (
            <label key={r.key} className={`report-reason${reason === r.key ? ' active' : ''}`}>
              <input type="radio" name="report-reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} />
              {r.label}
            </label>
          ))}
        </div>
        <label className="field">
          <span>Details <em>(optional)</em></span>
          <textarea
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. The answer should be C because…"
          />
        </label>
        {error && <p className="error small">{error}</p>}
      </Modal>
    </>
  )
}
