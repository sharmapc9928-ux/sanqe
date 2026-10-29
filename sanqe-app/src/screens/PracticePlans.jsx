import { useState } from 'react'
import { ArrowRight, Check, Tag, X } from 'lucide-react'
import { Page } from '../components/Layout'
import { EmptyState, SkeletonCards } from '../components/ui'
import { useApp } from '../lib/appContext'
import { payForPractice } from '../lib/coaching'
import { ALL_SUBJECTS_NOTE, FREE_TOPICS_NOTE, formatMonths, formatPassDate, formatRupees, TIER_FEATURES, usePracticePlans } from '../lib/practice'
import { linkProps, navigate } from '../lib/router'
import { saveReturnTo } from '../lib/storage'

const TIER_NAME = { prelims: 'Prelims', full: 'Prelims + Mains' }

// Practice plans: what each one includes and the buy button. Open to everyone;
// buying asks a logged-out visitor to log in first.
export default function PracticePlans() {
  const { guest, hasCourse, practiceAccess, practicePass, refreshPass } = useApp()
  const { plans, state } = usePracticePlans()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [bought, setBought] = useState(null)

  // The cheapest way to the full plan, per month.
  const monthly = (p) => p.amount_inr / p.months
  const fullPlans = plans.filter((p) => p.tier === 'full')
  const bestKey = fullPlans.length > 1 ? fullPlans.reduce((a, b) => (monthly(b) < monthly(a) ? b : a)).key : null

  const buy = async (plan) => {
    if (guest) {
      saveReturnTo('/plans', 'Practice plans')
      navigate('/login')
      return
    }
    setBusy(plan.key)
    setError('')
    try {
      const result = await payForPractice(plan.key)
      if (result) {
        await refreshPass()
        setBought(result)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const label = (plan) => {
    if (guest) return 'Log in to buy'
    if (busy === plan.key) return 'Opening payment…'
    if (practiceAccess === 'full' && plan.tier === 'prelims') return 'Included in your plan'
    const held = practicePass?.tier
    let verb = 'Buy'
    if (held === plan.tier) verb = 'Extend'
    else if (held === 'prelims' && plan.tier === 'full') verb = 'Upgrade'
    return `${verb} · ${formatRupees(plan.amount_inr)}`
  }

  return (
    <Page backTo="/practice" title="Practice plans" subtitle={`${FREE_TOPICS_NOTE} are free. A plan opens every other Prelims topic in ${ALL_SUBJECTS_NOTE}; Prelims + Mains adds the Mains sets.`}>
      {bought && (
        <div className="card plan-note ok" role="status">
          <Check size={18} />
          <p>
            <b>You’re in.</b> {TIER_NAME[bought.tier]} access is on till {formatPassDate(bought.until)}.
          </p>
          <a className="btn primary" {...linkProps('/practice')}>Start practising <ArrowRight size={15} /></a>
        </div>
      )}
      {!bought && !guest && practicePass?.tier && (
        <p className="card plan-note" role="status">
          <Tag size={18} /> You have {TIER_NAME[practicePass.tier]} access till {formatPassDate(practicePass.until)}.
        </p>
      )}
      {!bought && !guest && !practicePass?.tier && hasCourse && (
        <p className="card plan-note" role="status">
          <Tag size={18} /> Practice is already open for you through your coaching course or FEDGE All-Access.
        </p>
      )}

      {state === 'loading' && <SkeletonCards count={4} height={260} />}
      {state === 'error' && <p className="error" role="alert">Couldn’t load the plans. Check your connection and refresh.</p>}
      {state === 'ready' && plans.length === 0 && (
        <EmptyState title="Plans are coming soon">Practice plans aren’t on sale yet. {FREE_TOPICS_NOTE} are free in the meantime.</EmptyState>
      )}

      {plans.length > 0 && (
        <div className="plan-grid pair">
          {plans.map((p) => {
            const features = TIER_FEATURES[p.tier]
            const disabled = !!busy || practiceAccess === 'checking' || (practiceAccess === 'full' && p.tier === 'prelims' && !guest)
            return (
              <div key={p.key} className={`card plan-card${p.key === bestKey ? ' best' : ''}`}>
                {p.key === bestKey && <span className="plan-badge">Best value</span>}
                <h2>{p.label}</h2>
                <p className="plan-price">{formatRupees(p.amount_inr)}<span> / {formatMonths(p.months)}</span></p>
                <p className="muted small">About {formatRupees(Math.round(monthly(p)))} a month</p>
                <ul className="plan-features">
                  {features.yes.map((f) => <li key={f}><Check size={14} aria-hidden="true" /> {f}</li>)}
                  {features.no.map((f) => <li key={f} className="no"><X size={14} aria-hidden="true" /> {f}</li>)}
                </ul>
                <p className="plan-count">{features.count}</p>
                <button type="button" className="btn primary" disabled={disabled} onClick={() => buy(p)}>{label(p)}</button>
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="hint">Pay with UPI, cards or net banking through Razorpay. A plan ends on its date and doesn’t renew by itself.</p>
    </Page>
  )
}
