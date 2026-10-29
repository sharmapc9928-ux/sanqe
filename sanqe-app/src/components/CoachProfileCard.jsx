import { useEffect, useState } from 'react'
import { CalendarClock, Copy, FileText, Pencil } from 'lucide-react'
import { linkProps } from '../lib/router'
import { formatDate } from '../lib/format'
import { fetchMyCoaching, isPaidUp, plansLive } from '../lib/coaching'

// Teacher's profile panel: the referral code to share with students, how long the plan runs, and links to renew it or edit details.
export function CoachProfileCard({ user, open, onNavigate }) {
  const [coaching, setCoaching] = useState(null)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    fetchMyCoaching(user.id).then((c) => { if (!cancelled) setCoaching(c) }).catch(() => {})
    return () => { cancelled = true }
  }, [open, user.id])

  if (!coaching) return null
  const paid = isPaidUp(coaching)

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(''), 2000)
    } catch { /* it's on screen to copy by hand */ }
  }

  return (
    <div className="profile-panel-info coach-profile">
      <div className="profile-info-row"><span>Coaching</span><strong>{coaching.name}</strong></div>

      {coaching.referral_code && (
        <div className="coach-profile-item">
          <span className="setting-label">Referral code</span>
          <div className="coach-profile-value">
            <span className="coach-referral">{coaching.referral_code}</span>
            <button type="button" className="btn small" onClick={() => copy(coaching.referral_code, 'code')}><Copy size={14} /> {copied === 'code' ? 'Copied' : 'Copy'}</button>
          </div>
          <span className="muted small">Students enter it under Courses in the app.</span>
        </div>
      )}

      {plansLive(coaching) && (
        <div className="profile-info-row">
          <span><CalendarClock size={14} /> Plan</span>
          <a className="link-btn" {...linkProps('/coach/plan')} onClickCapture={onNavigate}>
            <strong>{paid ? `Till ${formatDate(coaching.paid_until)} · Renew` : 'Not active · Choose a plan'}</strong>
          </a>
        </div>
      )}
      <a className="btn small ghost" {...linkProps('/coach/details')} onClickCapture={onNavigate}><Pencil size={14} /> Edit coaching details</a>
      <a className="btn small ghost" {...linkProps('/partner')} onClickCapture={onNavigate}><FileText size={14} /> Business, GST and bank details</a>
    </div>
  )
}
