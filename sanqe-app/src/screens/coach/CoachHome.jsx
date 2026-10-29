import { useCallback, useEffect, useState } from 'react'
import { Building2, Check, ChevronRight, ClipboardList, Clock, Copy, FileText, KeyRound, Plus, ShieldOff, Upload } from 'lucide-react'
import { Page } from '../../components/Layout'
import { EmptyState, SkeletonCards } from '../../components/ui'
import { useApp } from '../../lib/appContext'
import { INDIA_DISTRICTS, INDIA_STATES } from '../../content/indiaDistricts'
import { back, linkProps, navigate } from '../../lib/router'
import { formatDate } from '../../lib/format'
import {
  applyCoaching, createMockForExam, createSeries, fedgeLive, fetchCoachingPlans, fetchCoachMocks, fetchCoachSeriesList, fetchFedgePlans, fetchFedgeSales, fetchMyCoaching, formatMinutes, formatPrice,
  hasFedgePack, isPaidUp, payForPlan, setFedgePrice, syncFedgePack, updateCoaching,
} from '../../lib/coaching'
import { MOCK_EXAMS } from '../../lib/examLogos'
import { fetchMyPartnerApplication } from '../../lib/partner'

// Coaching portal home: apply → wait for approval → manage mocks by exam.
export default function CoachHome() {
  const { user } = useApp()
  const [coaching, setCoaching] = useState(undefined) // undefined = loading, null = none
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchMyCoaching(user.id)
      .then((c) => { if (!cancelled) setCoaching(c) })
      .catch((e) => { if (!cancelled) { setError(e.message); setCoaching(null) } })
    return () => { cancelled = true }
  }, [user.id])

  if (coaching === undefined) {
    return <Page title="Coaching portal"><SkeletonCards count={2} height={120} /></Page>
  }
  if (!coaching) {
    return (
      <Page title="Sell your mocks on Fedge Sanqe" subtitle="Run your own full-length test series for your students — exam-style test window, sectional timers, instant results and ranks within your batch.">
        {error && <p className="error" role="alert">{error}</p>}
        <HowItWorks applyTo="/coach/apply" />
      </Page>
    )
  }
  if (coaching.status === 'pending') {
    return (
      <Page title={coaching.name} subtitle="Coaching portal">
        <div className="card coach-status">
          <span className="coach-status-icon tone-mid"><Clock size={20} /></span>
          <div>
            <h2>Application under review</h2>
            <p className="muted">We check every coaching before it can publish mocks. You&apos;ll be able to build test series here as soon as you&apos;re approved — usually within a day.</p>
          </div>
        </div>
        <h2 className="section-title">Your details</h2>
        <CoachingForm initial={coaching} submitLabel="Save details" onSave={async (f) => setCoaching(await updateCoaching(coaching.id, f))} />
      </Page>
    )
  }
  if (coaching.status === 'suspended') {
    return (
      <Page title={coaching.name} subtitle="Coaching portal">
        <div className="card coach-status">
          <span className="coach-status-icon tone-low"><ShieldOff size={20} /></span>
          <div>
            <h2>Account paused</h2>
            <p className="muted">This coaching account is paused, so its mocks are hidden from students. Contact Fedge support to sort it out.</p>
          </div>
        </div>
      </Page>
    )
  }
  if (!isPaidUp(coaching)) {
    const ended = coaching.paid_until ? formatDate(coaching.paid_until) : null
    return (
      <Page
        title={coaching.name}
        subtitle={ended
          ? `Your plan ended on ${ended}. Renew to keep building and selling mocks — your students keep what they already joined.`
          : 'Your referral code is ready. Choose a plan to also open your own coaching portal.'}
      >
        <FedgeSalesCard coaching={coaching} />
        <h2 className="section-title">Your own mocks &amp; courses</h2>
        <PlanPicker coaching={coaching} onPaid={(until) => setCoaching({ ...coaching, paid_until: until })} />
      </Page>
    )
  }
  return <CoachDashboard coaching={coaching} />
}

// Monthly / yearly plan cards; paying opens Razorpay Checkout.
function PlanPicker({ coaching, onPaid }) {
  const [plans, setPlans] = useState(null)
  const [busy, setBusy] = useState(null) // plan key being paid
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCoachingPlans().then(setPlans).catch((e) => { setPlans([]); setError(e.message) })
  }, [])

  const pay = async (plan) => {
    setBusy(plan.key)
    setError('')
    try {
      const until = await payForPlan(plan.key)
      if (until) onPaid(until)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const pct = Number(coaching.commission_pct ?? 35)
  return (
    <>
      {plans === null && <SkeletonCards count={2} height={180} />}
      {plans && plans.length > 0 && (
        <div className="plan-grid">
          {plans.map((p) => {
            const months = Math.round(p.days / 30)
            const badge = p.pack_level >= 3 ? 'Most Fedge mocks' : months >= 12 ? 'Best value' : null
            return (
              <div key={p.key} className={`card plan-card${badge === 'Best value' ? ' best' : ''}${p.active ? '' : ' soon'}`}>
                {badge && <span className="plan-badge">{badge}</span>}
                <h2>{p.label}</h2>
                <p className="plan-price">₹{p.amount_inr.toLocaleString('en-IN')}<span> / {months >= 12 ? 'year' : 'month'}</span></p>
                <p className="muted small">
                  {months > 1 ? `≈ ₹${Math.round(p.amount_inr / months).toLocaleString('en-IN')} a month · ` : ''}{p.days} days of your portal
                </p>
                {p.features?.length > 0 && (
                  <ul className="plan-features">
                    {p.features.map((f) => <li key={f}><Check size={14} /> {f}</li>)}
                  </ul>
                )}
                <button type="button" className="btn primary" disabled={!!busy || !p.active} onClick={() => pay(p)}>
                  {!p.active ? 'Coming soon' : busy === p.key ? 'Opening payment…' : `Pay ₹${p.amount_inr.toLocaleString('en-IN')}`}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="admin-hint">
        Pay by UPI, card or netbanking through Razorpay. Your portal opens as soon as the payment goes through.
        On online sales to your students you keep {100 - pct}% (Fedge&apos;s fee is {pct}%).
      </p>
      <PartnerDetailsNote />
    </>
  )
}

// Selling Fedge's mocks to the coaching's students: the referral code they
// type under Courses, the price the coaching sets (never under the floor Fedge
// sets) and what has sold. Needs no portal plan. Hidden until the Fedge-passes
// migration is on the database.
function FedgeSalesCard({ coaching }) {
  const [plans, setPlans] = useState(null)
  const [sales, setSales] = useState(null)
  const [saved, setSaved] = useState(Number(coaching.fedge_price_inr))
  const [price, setPrice] = useState(String(coaching.fedge_price_inr))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const live = fedgeLive(coaching)

  useEffect(() => {
    if (!live) return undefined
    let cancelled = false
    fetchFedgePlans().then((p) => { if (!cancelled) setPlans(p) }).catch(() => { if (!cancelled) setPlans({}) })
    fetchFedgeSales(coaching.id).then((s) => { if (!cancelled) setSales(s) }).catch(() => {})
    return () => { cancelled = true }
  }, [live, coaching.id])
  if (!live) return null

  const min = plans?.mocks?.amount_inr ?? 299
  const months = plans?.mocks?.months ?? 9
  const pct = Number(coaching.commission_pct ?? 35)
  const p = Number(price)
  const valid = price !== '' && Number.isInteger(p) && p >= min && p <= 100000
  const share = valid ? p - Math.round((p * pct) / 100) : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coaching.referral_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* it's on screen to copy by hand */ }
  }

  const save = async (e) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const row = await setFedgePrice(coaching.id, p)
      setSaved(Number(row.fedge_price_inr))
      setNotice('Price saved. Students see it under Courses.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card coach-sell" aria-labelledby="coach-sell-title">
      <h2 id="coach-sell-title">Sell Fedge mocks to your students</h2>
      <p className="muted small">
        Give students your referral code. They enter it under <b>Courses</b>, then pay your price to get every Fedge mock for {months} months.
        You keep {100 - pct}% of each sale; Fedge pays you out.
      </p>
      <div className="coach-sell-grid">
        <div className="coach-sell-block">
          <span className="setting-label">Your referral code</span>
          <div className="coach-sell-code">
            <span className="coach-referral">{coaching.referral_code}</span>
            <button type="button" className="btn small" onClick={copy}><Copy size={14} /> {copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
        <form className="coach-sell-block" onSubmit={save}>
          <label className="field">
            <span>Your price for Fedge mocks, in ₹ <em>(at least ₹{min.toLocaleString('en-IN')})</em></span>
            <input type="number" min={min} max={100000} step={1} inputMode="numeric" value={price} onChange={(e) => { setPrice(e.target.value); setNotice('') }} />
          </label>
          {share !== null && <p className="admin-hint">You get <b>₹{share.toLocaleString('en-IN')}</b> of each ₹{p.toLocaleString('en-IN')} sale (Fedge’s fee is {pct}%).</p>}
          {price !== '' && !valid && <p className="error small" role="alert">Enter a whole number of rupees, ₹{min.toLocaleString('en-IN')} or more.</p>}
          {error && <p className="error small" role="alert">{error}</p>}
          {notice && <p className="admin-notice" role="status">{notice}</p>}
          <button type="submit" className="btn primary" disabled={busy || !valid || p === saved}>{busy ? 'Saving…' : 'Save price'}</button>
        </form>
      </div>
      {sales && (
        <p className="admin-hint">
          Sold so far: <b>{sales.sales}</b> · your share <b>₹{sales.share.toLocaleString('en-IN')}</b>
          {sales.owed > 0 ? <> · <b>₹{sales.owed.toLocaleString('en-IN')}</b> still to be paid out to you</> : ''}
        </p>
      )}
    </section>
  )
}

// Asks for the business, GST and bank details (the partner form) until the
// coaching has sent them.
function PartnerDetailsNote() {
  const { user } = useApp()
  const [sent, setSent] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchMyPartnerApplication(user.id)
      .then((r) => { if (!cancelled) setSent(!!r) })
      .catch(() => { if (!cancelled) setSent(true) }) // not set up yet: say nothing
    return () => { cancelled = true }
  }, [user.id])
  if (sent !== false) return null
  return (
    <a className="card coach-details-note" {...linkProps('/partner')}>
      <FileText size={20} aria-hidden="true" />
      <span>
        <b>Send your business details</b>
        <span>GST, billing address and bank account for your invoices and payouts. Takes about 5 minutes.</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </a>
  )
}

// Loads the caller's coaching for the pages below; null while loading.
function useMyCoaching() {
  const { user } = useApp()
  const [coaching, setCoaching] = useState(undefined)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    fetchMyCoaching(user.id)
      .then((c) => {
        if (cancelled) return
        if (!c) navigate('/coach', { replace: true, force: true })
        else setCoaching(c)
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [user.id])
  return { coaching, error }
}

// /coach/plan: renew or extend the plan (opened from the profile panel).
export function CoachPlan() {
  const { coaching, error } = useMyCoaching()
  return (
    <Page
      title="Your plan"
      subtitle={coaching?.paid_until && isPaidUp(coaching) ? `Paid till ${formatDate(coaching.paid_until)}. Paying now adds to that date.` : 'Choose a plan to open your coaching portal.'}
      backTo="/coach"
    >
      {error && <p className="error" role="alert">{error}</p>}
      {!coaching && !error && <SkeletonCards count={2} height={180} />}
      {coaching && <PlanPicker coaching={coaching} onPaid={() => navigate('/coach', { replace: true })} />}
    </Page>
  )
}

// /coach/details: edit name, page link, place and phone (from the profile panel).
export function CoachDetails() {
  const { coaching, error } = useMyCoaching()
  return (
    <Page title="Coaching details" backTo="/coach">
      {error && <p className="error" role="alert">{error}</p>}
      {!coaching && !error && <SkeletonCards count={1} height={320} />}
      {coaching && (
        <CoachingForm
          initial={coaching}
          submitLabel="Save details"
          onCancel={() => back('/coach')}
          onSave={async (f) => { await updateCoaching(coaching.id, f); back('/coach') }}
        />
      )}
    </Page>
  )
}

// /coach/apply: the application form on its own page, opened from Apply.
// An account that has already applied goes back to the portal.
export function CoachApply() {
  const { user } = useApp()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchMyCoaching(user.id)
      .then((c) => {
        if (cancelled) return
        if (c) navigate('/coach', { replace: true, force: true })
        else setReady(true)
      })
      .catch((e) => { if (!cancelled) { setError(e.message); setReady(true) } })
    return () => { cancelled = true }
  }, [user.id])

  return (
    <Page title="Apply as a coaching" subtitle="Tell us about your coaching. Your portal opens as soon as you send this." backTo="/coach">
      {error && <p className="error" role="alert">{error}</p>}
      {!ready && <SkeletonCards count={1} height={320} />}
      {ready && (
        <CoachingForm
          submitLabel="Send application"
          onCancel={() => back('/coach')}
          onSave={async (f) => {
            await applyCoaching(f)
            navigate('/coach', { replace: true })
          }}
        />
      )}
    </Page>
  )
}

// The three steps; "Apply" links to the application form.
function HowItWorks({ applyTo }) {
  const steps = [
    { Icon: Building2, title: 'Apply', text: 'Tell us your coaching’s name and place. You get your referral code straight away.', to: applyTo },
    { Icon: KeyRound, title: 'Share your code', text: 'Students enter it in the app and buy Fedge’s mocks at the price you set (from ₹299). You keep 65% of every sale.' },
    { Icon: Upload, title: 'Add your own mocks', text: 'Optional: create test series, add sections and upload questions from Excel / CSV for your batch.' },
  ]
  return (
    <ol className="coach-steps">
      {steps.map(({ Icon, title, text, to }, i) => (
        <li key={title} className={`card coach-step${to ? ' clickable' : ''}`}>
          <span className="coach-step-num">{i + 1}</span>
          <Icon size={18} />
          <h3>{to ? <a className="coach-step-action" {...linkProps(to)}>{title}</a> : title}</h3>
          <p className="muted small">{text}</p>
        </li>
      ))}
    </ol>
  )
}

function CoachingForm({ initial, submitLabel, onSave, onCancel }) {
  const [f, setF] = useState({
    name: initial?.name || '', state: initial?.state || '', city: initial?.city || '', phone: initial?.phone || '', about: initial?.about || '', slug: initial?.slug || '',
  })
  // The district is kept in the `city` column. One saved before the list
  // existed stays selectable so it isn't lost.
  const districts = INDIA_DISTRICTS[f.state] || []
  const savedOutsideList = !!f.city && !districts.includes(f.city)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const set = (k) => (e) => {
    const v = e.target.value
    setF((x) => ({ ...x, [k]: v }))
    setSaved(false)
  }
  const setState = (e) => {
    setF((x) => ({ ...x, state: e.target.value, city: '' }))
    setSaved(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (f.name.trim().length < 2) { setError('Enter your coaching’s name.'); return }
    if (!f.state) { setError('Choose your state.'); return }
    if (!f.city) { setError('Choose your district.'); return }
    setBusy(true)
    setError('')
    try {
      await onSave(f)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card admin-form coach-form" onSubmit={submit}>
      <label className="field"><span>Coaching name</span><input value={f.name} onChange={set('name')} maxLength={80} required /></label>
      <div className="coach-form-row">
        <label className="field">
          <span>State</span>
          <select value={f.state} onChange={setState} required>
            <option value="" disabled>Choose your state</option>
            {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            {f.state && !INDIA_STATES.includes(f.state) && <option value={f.state}>{f.state}</option>}
          </select>
        </label>
        <label className="field">
          <span>District</span>
          <select value={f.city} onChange={set('city')} disabled={!f.state} required>
            <option value="" disabled>{f.state ? 'Choose your district' : 'Choose a state first'}</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            {savedOutsideList && <option value={f.city}>{f.city}</option>}
          </select>
        </label>
      </div>
      <label className="field"><span>Phone <em>(only Fedge sees it)</em></span><input value={f.phone} onChange={set('phone')} maxLength={20} inputMode="tel" /></label>
      <label className="field"><span>About <em>(optional, shown on your page: exams you teach, results, batch size)</em></span><textarea rows={3} value={f.about} onChange={set('about')} maxLength={500} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && !error && initial && <p className="admin-notice" role="status">Saved.</p>}
      <div className="admin-actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Close</button>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  )
}

// Exam names as students see them ("Sbi Po" -> "SBI PO").
const examName = (exam) => {
  const e = (exam || '').trim()
  return MOCK_EXAMS.find((x) => x.name.toLowerCase() === e.toLowerCase())?.name || e || 'Other mocks'
}

// The portal is a list of mocks by exam: no series screens. Mocks sit in the
// series of their exam behind the scenes.
function CoachDashboard({ coaching }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [courses, setCourses] = useState(null)
  const [newCourse, setNewCourse] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    fetchCoachMocks(coaching.id).then(setList).catch((e) => { setList([]); setError(e.message) })
    fetchCoachSeriesList(coaching.id).then(setCourses).catch(() => setCourses([]))
  }, [coaching.id])
  useEffect(() => { load() }, [load])

  // Pick up the mocks Fedge has published for this plan since the last visit.
  const pack = hasFedgePack(coaching)
  useEffect(() => {
    if (!pack) return undefined
    let cancelled = false
    syncFedgePack()
      .then((n) => {
        if (cancelled || n === 0) return
        setNotice(`${n} new Fedge mock${n === 1 ? '' : 's'} added to your portal.`)
        load()
      })
      .catch(() => { /* the pack shows up on the next visit */ })
    return () => { cancelled = true }
  }, [pack, load])

  const groups = []
  for (const m of list || []) {
    const exam = examName(m.test_series?.exam)
    const g = groups.find((x) => x.exam === exam)
    if (g) g.mocks.push(m)
    else groups.push({ exam, mocks: [m] })
  }
  groups.sort((a, b) => (a.exam === 'Other mocks') - (b.exam === 'Other mocks') || a.exam.localeCompare(b.exam))
  const published = (list || []).filter((m) => m.status === 'published').length
  const attempts = (list || []).reduce((n, m) => n + m.attemptCount, 0)

  return (
    <Page className="coach-page">
      <section className="coach-head">
        <div>
          <p className="eyebrow">Coaching portal</p>
          <h1 className="coach-title">{coaching.name}</h1>
        </div>
        <button type="button" className="btn accent" onClick={() => setCreating(true)}><Plus size={15} /> New mock</button>
      </section>

      {coaching.paid_until && isPaidUp(coaching) && (
        <p className="coach-plan-strip">
          <span className="coach-plan-dot" aria-hidden="true" />
          <span>Portal active · paid till <b>{formatDate(coaching.paid_until)}</b>{pack ? ' · Fedge mocks included' : ''}</span>
          <a {...linkProps('/coach/plan')}>Renew</a>
        </p>
      )}
      <FedgeSalesCard coaching={coaching} />
      <PartnerDetailsNote />
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {list && list.length > 0 && (
        <section className="stat-strip coach-stats" aria-label="Your mocks in numbers">
          <div className="stat-cell"><span className="eyebrow">Mocks</span><span className="stat-value num">{list.length}</span><span className="stat-sub">{groups.length} exam{groups.length === 1 ? '' : 's'}</span></div>
          <div className="stat-cell"><span className="eyebrow">Published</span><span className="stat-value num">{published}</span><span className="stat-sub">{list.length - published} in draft</span></div>
          <div className="stat-cell"><span className="eyebrow">Attempts</span><span className="stat-value num">{attempts.toLocaleString('en-IN')}</span><span className="stat-sub">by students</span></div>
        </section>
      )}

      {creating && <NewMockForm coaching={coaching} onCancel={() => setCreating(false)} />}
      {list === null && <SkeletonCards count={2} height={96} />}
      {list && list.length === 0 && !creating && (
        <EmptyState
          icon={ClipboardList}
          title="No mocks yet"
          action={<button type="button" className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> Add your first mock</button>}
        >
          Pick the exam, name the mock, then add its sections and questions or import a CSV. Published mocks show up in Mock Tests under their exam.
        </EmptyState>
      )}
      {groups.map(({ exam, mocks }) => (
        <section key={exam} className="coach-series" aria-label={exam}>
          <div className="section-head">
            <h2>{exam}</h2>
          </div>
          <ul className="coach-list">
            {mocks.map((m) => (
              <li key={m.id}>
                <a className="card coach-row" {...linkProps(`/coach/mocks/${m.id}`)}>
                  <span className="coach-row-main">
                    <b>{m.title}{m.test_series?.source_series_id && <span className="from-fedge">From Fedge</span>}</b>
                    <span className="muted small">
                      {m.questionCount} questions · {m.totalSec ? formatMinutes(m.totalSec) : 'no time set'}
                      {m.status === 'published' ? ` · ${m.attemptCount} attempt${m.attemptCount === 1 ? '' : 's'}` : ''}
                    </span>
                  </span>
                  <span className={`pill ${m.status === 'published' ? 'tone-great' : 'tone-mid'}`}>{m.status === 'published' ? 'Published' : 'Draft'}</span>
                  <ChevronRight size={18} className="chev" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="coach-series" aria-labelledby="coach-courses-title">
        <div className="section-head">
          <h2 id="coach-courses-title">Courses &amp; pricing</h2>
          <button type="button" className="btn small" onClick={() => setNewCourse(true)}><Plus size={14} /> New course</button>
        </div>
        <p className="admin-hint">A course is what your students join or buy. Set its price, make access codes for students who paid you directly, and see who joined.</p>
        {newCourse && (
          <SeriesForm
            commissionPct={coaching.commission_pct}
            submitLabel="Create course"
            onCancel={() => setNewCourse(false)}
            onSave={async (f) => {
              const s = await createSeries(coaching.id, f)
              navigate(`/coach/series/${s.id}`)
            }}
          />
        )}
        {courses && courses.length > 0 && (
          <ul className="coach-index">
            <li className="coach-index-head" aria-hidden="true">
              <span>Course</span><span>Mocks</span><span>Students</span><span>Price</span><span>Status</span>
            </li>
            {courses.map((x) => (
              <li key={x.id}>
                <a className="coach-index-row" {...linkProps(`/coach/series/${x.id}`)}>
                  <span className="coach-index-name">
                    <b>{x.title}</b>
                    {x.exam && <span>{x.exam}</span>}
                  </span>
                  <span className="num" data-label="Mocks">{x.mockCount}</span>
                  <span className="num" data-label="Students">{x.studentCount}</span>
                  <span className="num" data-label="Price">{x.price_inr === null || x.price_inr === undefined ? '—' : formatPrice(x.price_inr)}</span>
                  <span className={`coach-status-dot ${x.on_sale ? 'live' : 'hidden'}`}>{x.on_sale ? 'On sale' : 'Hidden'}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}

// Exam + mock name; the mock opens on its own settings page.
function NewMockForm({ coaching, onCancel }) {
  const [exam, setExam] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (exam.trim().length < 2 || title.trim().length < 2 || busy) return
    setBusy(true)
    setError('')
    try {
      const m = await createMockForExam(coaching.id, exam, title)
      navigate(`/coach/mocks/${m.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="card admin-form coach-form" onSubmit={submit}>
      <label className="field">
        <span>Exam</span>
        <input list="coach-exams" value={exam} onChange={(e) => setExam(e.target.value)} maxLength={60} placeholder="IBPS RRB PO" autoFocus />
        <datalist id="coach-exams">{MOCK_EXAMS.map((x) => <option key={x.slug} value={x.name} />)}</datalist>
      </label>
      <label className="field">
        <span>Mock name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="IBPS RRB PO Prelims · Full Mock 3" />
        <em className="muted small">A mock goes under Prelims unless its name says Mains.</em>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="admin-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy || exam.trim().length < 2 || title.trim().length < 2}>{busy ? 'Creating…' : 'Create mock'}</button>
      </div>
    </form>
  )
}

export function SeriesForm({ initial, onSave, onCancel, commissionPct, submitLabel = 'Create test series' }) {
  const [f, setF] = useState({
    title: initial?.title || '',
    exam: initial?.exam || '',
    description: initial?.description || '',
    price: initial?.price_inr ?? '',
    onSale: !!initial?.on_sale,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const price = f.price === '' ? null : Number(f.price)
  const pct = Number(commissionPct ?? 35)
  const yourShare = price > 0 ? Math.floor((price * (100 - pct)) / 100) : null

  const submit = async (e) => {
    e.preventDefault()
    if (f.title.trim().length < 2) { setError('Give the series a name.'); return }
    if (price !== null && !(Number.isInteger(price) && price >= 0 && price <= 100000)) { setError('Price must be a whole number of rupees, up to ₹1,00,000.'); return }
    if (f.onSale && price === null) { setError('Set a price (0 for free) before putting the course on sale.'); return }
    setBusy(true)
    setError('')
    try {
      await onSave(f)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card admin-form coach-form" onSubmit={submit}>
      <label className="field"><span>Series name</span><input value={f.title} onChange={set('title')} maxLength={100} placeholder="SBI PO Prelims 2026 — Test Series" autoFocus /></label>
      <label className="field"><span>Exam <em>(optional)</em></span><input value={f.exam} onChange={set('exam')} maxLength={60} placeholder="SBI PO" /></label>
      <label className="field"><span>Description <em>(optional, students see it)</em></span><textarea rows={3} value={f.description} onChange={set('description')} maxLength={1000} /></label>
      <div className="coach-form-row">
        <label className="field">
          <span>Price in ₹ <em>(0 = free)</em></span>
          <input type="number" min={0} max={100000} step={1} inputMode="numeric" value={f.price} onChange={set('price')} placeholder="499" />
        </label>
        <label className="coach-check">
          <input type="checkbox" checked={f.onSale} onChange={(e) => setF((x) => ({ ...x, onSale: e.target.checked }))} />
          <span>On sale<br /><em className="muted small">Students of your coaching see it under Courses and can join or buy it.</em></span>
        </label>
      </div>
      {yourShare !== null && (
        <p className="admin-hint">
          Once online payments go live, you get <b>₹{yourShare.toLocaleString('en-IN')}</b> of each ₹{price.toLocaleString('en-IN')} sale (Fedge&apos;s fee is {pct}%).
          Until then, students who paid you directly join with an access code.
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="admin-actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  )
}
