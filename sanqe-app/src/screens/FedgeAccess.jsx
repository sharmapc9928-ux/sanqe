import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, Tag } from 'lucide-react'
import { Page } from '../components/Layout'
import { SkeletonCards } from '../components/ui'
import { useApp } from '../lib/appContext'
import { fetchFedgePlans, fetchMyFedgeAccess, payForFedge } from '../lib/coaching'
import { formatMonths, formatPassDate, formatRupees } from '../lib/practice'
import { linkProps, navigate } from '../lib/router'
import { ReferralForm } from './Courses'

// What FEDGE All-Access includes when the plan row has no list of its own.
const ALL_ACCESS_FEATURES = [
  'Every Fedge full-length and sectional mock',
  'All of Practice: Prelims and Mains, with explanations',
  'Learn notes and the Daily Challenge',
  'Mistake Notebook and focus timer',
]

// Unlock Fedge's mocks: FEDGE All-Access straight from Fedge, or through a
// coaching (referral code, then the price that coaching set). One mock per exam
// is free, so a student can try before paying.
export default function FedgeAccess() {
  const { refreshHasCourse } = useApp()
  const [plans, setPlans] = useState(null)
  const [access, setAccess] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bought, setBought] = useState(null)

  const load = useCallback(() => {
    fetchFedgePlans().then(setPlans).catch(() => { setPlans({}); setError('Couldn’t load the price. Check your connection and refresh.') })
    fetchMyFedgeAccess().then(setAccess).catch(() => setAccess({ until: null, all_until: null }))
  }, [])
  useEffect(() => { load() }, [load])

  const all = plans?.all
  const floor = plans?.mocks?.amount_inr

  const buy = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await payForFedge('all')
      if (result) {
        await Promise.all([refreshHasCourse(), fetchMyFedgeAccess().then(setAccess)])
        setBought(result)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const hasAll = !!access?.all_until
  const hasPass = !!access?.until
  const label = busy ? 'Opening payment…' : hasAll ? `Active till ${formatPassDate(access.all_until)}` : `${hasPass ? 'Upgrade' : 'Buy'} · ${formatRupees(all?.amount_inr)}`

  return (
    <Page backTo="/mocks" title="Unlock Fedge mocks" subtitle="Every full-length and sectional mock by Fedge. One mock per exam is free to try.">
      {bought && (
        <div className="card plan-note ok" role="status">
          <Check size={18} />
          <p><b>You’re in.</b> FEDGE All-Access is on till {formatPassDate(bought.until)}.</p>
          <a className="btn primary" {...linkProps('/mocks')}>Open Mock Tests <ArrowRight size={15} /></a>
        </div>
      )}
      {!bought && hasPass && (
        <p className="card plan-note" role="status">
          <Tag size={18} /> You have {hasAll ? 'FEDGE All-Access' : 'access to Fedge mocks'} till {formatPassDate(access.until)}.
        </p>
      )}

      {plans === null && <SkeletonCards count={2} height={300} />}
      {plans && (
        <div className="plan-grid pair">
          <div className="card plan-card best">
            <span className="plan-badge">Everything</span>
            <h2>{all?.label || 'FEDGE All-Access'}</h2>
            {all ? (
              <>
                <p className="plan-price">{formatRupees(all.amount_inr)}<span> / {formatMonths(all.months)}</span></p>
                <p className="muted small">About {formatRupees(Math.round(all.amount_inr / all.months))} a month</p>
              </>
            ) : (
              <p className="muted">Coming soon.</p>
            )}
            <ul className="plan-features">
              {(all?.features?.length ? all.features : ALL_ACCESS_FEATURES).map((f) => <li key={f}><Check size={14} aria-hidden="true" /> {f}</li>)}
            </ul>
            <button type="button" className="btn primary" disabled={busy || !all || hasAll} onClick={buy}>{all ? label : 'Coming soon'}</button>
          </div>

          <div className="card plan-card">
            <h2>Through your coaching</h2>
            <p className="plan-price">{floor ? `From ${formatRupees(floor)}` : 'Your coaching’s price'}<span> / {formatMonths(plans?.mocks?.months || 9)}</span></p>
            <p className="muted small">Your coaching sets the price</p>
            <ul className="plan-features">
              <li><Check size={14} aria-hidden="true" /> Every Fedge full-length and sectional mock</li>
              <li><Check size={14} aria-hidden="true" /> New mocks Fedge adds in that time</li>
              <li><Check size={14} aria-hidden="true" /> Add your coaching with its referral code, then pay the price it set</li>
            </ul>
            <ReferralForm bare onJoined={() => navigate('/courses')} />
            <a className="btn" {...linkProps('/courses')}>Already added? Open Courses</a>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="hint">Pay with UPI, cards or net banking through Razorpay. A pass ends on its date and doesn’t renew by itself.</p>
    </Page>
  )
}
