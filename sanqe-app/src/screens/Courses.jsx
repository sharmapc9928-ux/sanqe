import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, GraduationCap, KeyRound, Sparkles } from 'lucide-react'
import { Page } from '../components/Layout'
import { RedeemCode } from '../components/SeriesSection'
import { EmptyState, Skeleton, SkeletonCards } from '../components/ui'
import { useApp } from '../lib/appContext'
import { formatPassDate } from '../lib/practice'
import { linkProps, navigate } from '../lib/router'
import { fetchCoachingPage, fetchMyCoachings, formatPrice, joinCoaching, joinFreeSeries, payForFedge, payForSeries, placeName } from '../lib/coaching'

// Courses: add a coaching with its referral code, then buy Fedge's mocks through
// it, or join or buy its own courses (test series), at the price the coaching set.
export default function Courses() {
  const [coachings, setCoachings] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetchMyCoachings()
      .then((c) => { setCoachings(c); setError('') })
      .catch((e) => { setCoachings([]); setError(e.message) })
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <Page title="Courses" subtitle="Add your coaching with the referral code it gave you, then get Fedge’s mocks and its test series at the price it set.">
      <ReferralForm onJoined={() => load()} />
      {coachings && coachings.length > 0 && (
        <RedeemCode
          label="Paid your coaching directly? Enter the access code they gave you."
          onRedeemed={(r) => navigate(`/series/${r.series_id}`)}
        />
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {coachings === null && <SkeletonCards count={2} height={86} />}
      {coachings && coachings.length === 0 && (
        <EmptyState
          icon={GraduationCap}
          title="No coaching yet"
          action={<a className="btn" {...linkProps('/unlock')}>No coaching? See FEDGE All-Access <ArrowRight size={15} /></a>}
        >
          Ask your coaching for its referral code and enter it above. Fedge’s mocks and its courses show up here.
        </EmptyState>
      )}
      {coachings && coachings.map((c) => <CoachingCourses key={c.id} coaching={c} />)}
    </Page>
  )
}

// One coaching the student has added, with the courses it has on sale.
function CoachingCourses({ coaching: c }) {
  const [page, setPage] = useState(undefined) // undefined = loading, null = none
  const [error, setError] = useState('')

  useEffect(() => {
    if (!c.slug) { setPage(null); return undefined }
    let cancelled = false
    fetchCoachingPage(c.slug)
      .then((p) => { if (!cancelled) setPage(p) })
      .catch((e) => { if (!cancelled) { setError(e.message); setPage(null) } })
    return () => { cancelled = true }
  }, [c.slug])

  const series = (page?.series || []).filter((s) => !s.is_open)
  const fedge = page?.fedge?.on_sale ? page.fedge : null
  return (
    <section className="series-section">
      <div className="section-head">
        <h2>{c.name}</h2>
        {placeName(c) && <span className="eyebrow">{placeName(c)}</span>}
      </div>
      {page === undefined && <Skeleton height={86} radius={14} />}
      {error && <p className="error small" role="alert">{error}</p>}
      {page && series.length === 0 && !fedge && <p className="muted">{c.name} hasn&apos;t put a course on sale yet.</p>}
      {(fedge || series.length > 0) && (
        <ul className="cpage-series">
          {fedge && <FedgeOffer coachingId={c.id} fedge={fedge} />}
          {series.map((s, i) => <SeriesCard key={s.id} index={i + 1} series={s} />)}
        </ul>
      )}
    </section>
  )
}

// Fedge's own mocks, sold through this coaching at the price it set. A running
// pass of either kind (this coaching's or FEDGE All-Access) already covers them.
function FedgeOffer({ coachingId, fedge }) {
  const { refreshHasCourse } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const buy = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await payForFedge('mocks', coachingId)
      if (!result) return setBusy(false)
      refreshHasCourse()
      navigate('/mocks')
    } catch (e) {
      // Paid already, but this list still shows Buy: the access is theirs, so open it.
      if (/already have access/i.test(e.message)) {
        navigate('/mocks')
        return
      }
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <li className="cpage-series-card fedge-offer">
      <span className="cpage-series-num" aria-hidden="true"><Sparkles size={16} /></span>
      <div className="cpage-series-main">
        <h3>All Fedge mocks</h3>
        <p className="cpage-series-desc">Every full-length and sectional mock by Fedge, for {fedge.months} months. New mocks Fedge adds in that time are included.</p>
        <div className="chip-row">
          <span className="chip">{fedge.mocks} mock{Number(fedge.mocks) === 1 ? '' : 's'} so far</span>
          <span className="chip">{fedge.months} months</span>
          {fedge.until && <span className="chip cpage-enrolled">active till {formatPassDate(fedge.until)}</span>}
        </div>
      </div>
      <div className="cpage-series-side">
        <span className="cpage-price num">{formatPrice(fedge.price_inr)}</span>
        {fedge.until ? (
          <a className="btn" {...linkProps('/mocks')}>Open Mock Tests <ArrowRight size={15} /></a>
        ) : (
          <button type="button" className="btn primary" onClick={buy} disabled={busy}>{busy ? 'Opening payment…' : `Buy ${formatPrice(fedge.price_inr)}`}</button>
        )}
        {error && <p className="error small" role="alert">{error}</p>}
      </div>
    </li>
  )
}

function SeriesCard({ index, series: s }) {
  const { refreshHasCourse } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const free = Number(s.price_inr) === 0

  const join = async () => {
    setBusy(true)
    setError('')
    try {
      await joinFreeSeries(s.id)
      refreshHasCourse()
      navigate(`/series/${s.id}`)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  // Opens the payment window; once the money is confirmed the student is
  // enrolled and taken into the series. Closing the window leaves things as is.
  const buy = async () => {
    setBusy(true)
    setError('')
    try {
      const seriesId = await payForSeries(s.id)
      if (!seriesId) return setBusy(false)
      refreshHasCourse()
      navigate(`/series/${seriesId}`)
    } catch (e) {
      // Paid already, but this list still shows Buy (the confirmation didn't
      // reach it in time): the series is theirs, so open it.
      if (/already have this test series/i.test(e.message)) {
        refreshHasCourse()
        navigate(`/series/${s.id}`)
        return
      }
      setError(e.message)
      setBusy(false)
    }
  }

  let action
  if (s.enrolled) {
    action = <a className="btn" {...linkProps(`/series/${s.id}`)}>Open <ArrowRight size={15} /></a>
  } else if (free) {
    action = <button type="button" className="btn primary" onClick={join} disabled={busy}>{busy ? 'Joining…' : 'Join free'}</button>
  } else {
    action = <button type="button" className="btn primary" onClick={buy} disabled={busy}>{busy ? 'Opening payment…' : `Buy ${formatPrice(s.price_inr)}`}</button>
  }

  return (
    <li className="cpage-series-card">
      <span className="cpage-series-num" aria-hidden="true">{String(index).padStart(2, '0')}</span>
      <div className="cpage-series-main">
        <h3>{s.title}</h3>
        {s.description && <p className="cpage-series-desc">{s.description}</p>}
        <div className="chip-row">
          {s.exam && <span className="chip">{s.exam}</span>}
          <span className="chip">{s.mocks} mock{s.mocks === 1 ? '' : 's'}</span>
          {s.enrolled && <span className="chip cpage-enrolled">enrolled</span>}
        </div>
      </div>
      <div className="cpage-series-side">
        <span className={`cpage-price num${free ? ' free' : ''}`}>{formatPrice(s.price_inr)}</span>
        {action}
        {error && <p className="error small" role="alert">{error}</p>}
      </div>
    </li>
  )
}

// `bare` drops the card around it, for use inside another card.
export function ReferralForm({ onJoined, bare = false }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clean = code.replace(/[^a-z0-9]/gi, '')

  const submit = async (e) => {
    e.preventDefault()
    if (clean.length < 4 || busy) return
    setBusy(true)
    setError('')
    try {
      const r = await joinCoaching(clean)
      setCode('')
      onJoined(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={bare ? 'redeem-card courses-referral' : 'card redeem-card courses-referral'} onSubmit={submit}>
      <span className="redeem-icon"><KeyRound size={18} /></span>
      <div className="redeem-body">
        <label htmlFor="referral-code" className="redeem-label">Coaching referral code</label>
        <div className="redeem-row">
          <input
            id="referral-code"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
            placeholder="e.g. K7M2QX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
          />
          <button type="submit" className="btn primary" disabled={busy || clean.length < 4}>
            {busy ? 'Checking…' : 'Join'}
          </button>
        </div>
        {error && <p className="error small" role="alert">{error}</p>}
      </div>
    </form>
  )
}
