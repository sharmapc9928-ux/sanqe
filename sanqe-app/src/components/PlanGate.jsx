import { Lock } from 'lucide-react'
import { useApp } from '../lib/appContext'
import { linkProps, navigate } from '../lib/router'
import { saveReturnTo } from '../lib/storage'
import { formatMonths, formatRupees, usePracticePlans } from '../lib/practice'

// Shown in place of a paid topic (or the notebook and focus timer) for someone
// without the plan for it. Logged out, "Log in" brings back a plan bought
// earlier; "See plans" is where buying happens. `tier` limits the prices shown
// to the plans of that tier (the Mains topics only come with 'full').
export function PlanGate({ title, children, returnTo, returnLabel, tier }) {
  const { guest } = useApp()
  const { plans: allPlans } = usePracticePlans()
  const plans = tier ? allPlans.filter((p) => p.tier === tier) : allPlans
  const login = () => {
    saveReturnTo(returnTo, returnLabel)
    navigate('/login')
  }
  return (
    <section className="card plan-gate" aria-labelledby="plan-gate-title">
      <span className="empty-icon"><Lock size={22} /></span>
      <h2 id="plan-gate-title" className="plan-gate-title">{title}</h2>
      <p>{children}</p>
      {plans.length > 0 && (
        <ul className="plan-gate-prices">
          {plans.map((p) => (
            <li key={p.key}><b>{p.label}</b> <span className="num">{formatRupees(p.amount_inr)}</span> <small>{formatMonths(p.months)}</small></li>
          ))}
        </ul>
      )}
      <div className="plan-gate-actions">
        <a className="btn primary" {...linkProps('/plans')}>See plans</a>
        {guest && <button type="button" className="btn" onClick={login}>Already have a plan? Log in</button>}
      </div>
    </section>
  )
}
