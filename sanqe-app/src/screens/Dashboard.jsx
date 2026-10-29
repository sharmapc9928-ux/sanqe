import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, NotebookPen, Play, Trophy } from 'lucide-react'
import { Page, SiteFooter } from '../components/Layout'
import { Skeleton } from '../components/ui'
import { useApp } from '../lib/appContext'
import { linkProps, navigate } from '../lib/router'
import { speedLevel, speedScore, TOPIC_BY_KEY } from '../lib/topics'
import { firstName, greeting } from '../lib/format'
import { FREE_TOPIC_KEYS, practicePath, SUBJECTS } from '../lib/syllabus'
import { fetchMyCoachings, fetchMySeries, joinCoaching, placeName } from '../lib/coaching'
import { CircleGame } from './SpeedGame'

const SPEED_MATHS = FREE_TOPIC_KEYS.map((k) => TOPIC_BY_KEY[k]).filter(Boolean)

// Questions a day the home screen counts towards. Fixed for now; there is no
// setting for it yet.
const DAILY_GOAL = 50

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Student home: the free warm-ups (Circle Game, speed maths) come first.
// Before a course, the coaching code follows; with a course, today's goal,
// the week, the subjects, their coaching and the daily challenge.
export default function Dashboard() {
  const { user, guest, stats, refreshStats, hasCourse } = useApp()
  useEffect(() => { refreshStats() }, [refreshStats])
  const name = firstName(user)
  const [coachings, setCoachings] = useState(guest ? [] : null)
  const [series, setSeries] = useState(guest ? [] : null)

  useEffect(() => {
    if (guest) return undefined
    let cancelled = false
    fetchMyCoachings().then((c) => { if (!cancelled) setCoachings(c) }).catch(() => { if (!cancelled) setCoachings([]) })
    fetchMySeries(user.id).then((s) => { if (!cancelled) setSeries(s) }).catch(() => { if (!cancelled) setSeries([]) })
    return () => { cancelled = true }
  }, [guest, user])

  const showJoin = guest || (!hasCourse && coachings?.length === 0)
  const today = Number(stats?.today_attempted) || 0
  const left = Math.max(0, DAILY_GOAL - today)

  return (
    <Page className="home" actions={guest ? <a className="btn ghost small" {...linkProps('/for-coaching')}>For coachings</a> : null}>
      <section className="home-hello">
        <h1 className="dash-title">{greeting()}{name ? `, ${name}` : ''}</h1>
        {hasCourse && (
          <p>
            {left > 0
              ? <>You’re <b>{left} question{left === 1 ? '' : 's'}</b> away from today’s goal. One short session does it.</>
              : 'Today’s goal is done. Anything more is a bonus.'}
          </p>
        )}
      </section>

      {/* Warm-ups first: the Circle Game, then the speed maths drills. */}
      <div className="home-split">
        <section aria-labelledby="home-game-title">
          <div className="section-head">
            <h2 id="home-game-title">Warm up</h2>
            <span className="home-free">Free</span>
          </div>
          <CircleGame compact />
        </section>

        <section aria-labelledby="home-speed-title">
          <div className="section-head">
            <h2 id="home-speed-title">Speed maths</h2>
            <span className="home-free">Free</span>
          </div>
          <div className="card drills">
            {SPEED_MATHS.map((t) => <SpeedRow key={t.key} topic={t} stats={stats?.topics?.[t.key]} />)}
          </div>
          <p className="speed-note">Speed score = accuracy × pace over your last 50 answers.</p>
        </section>
      </div>

      {showJoin && <JoinCoaching guest={guest} />}

      {hasCourse && stats && (
        <section className="hero-row" aria-label="Today">
          <GoalCard today={today} />
          <WeekCard stats={stats} />
          <ReviewNote due={Number(stats.review_due) || 0} />
        </section>
      )}

      <section className="home-block" aria-labelledby="home-subjects-title">
        <div className="section-head">
          <h2 id="home-subjects-title">Subjects</h2>
          <a className="link-btn" {...linkProps('/practice')}>Full syllabus <ArrowRight size={14} /></a>
        </div>
        <div className="subject-row">
          {SUBJECTS.map((s) => <SubjectTile key={s.key} subject={s} stats={stats} />)}
        </div>
      </section>

      {!guest && coachings && coachings.length > 0 && (
        <section className="home-block" aria-labelledby="home-coaching-title">
          <div className="section-head">
            <h2 id="home-coaching-title">{coachings.length > 1 ? 'Your coachings' : 'Your coaching'}</h2>
            <a className="link-btn" {...linkProps('/courses')}>All courses <ArrowRight size={14} /></a>
          </div>
          <div className="pass-list">
            {coachings.slice(0, 2).map((c) => (
              <CoachingPass key={c.id} coaching={c} series={(series || []).filter((s) => s.coaching?.id === c.id)} loading={series === null} />
            ))}
          </div>
        </section>
      )}
      {!guest && coachings === null && <Skeleton height={150} radius={18} />}

      {hasCourse && stats && <DailyBanner done={!!stats.daily_done_today} />}
      <SiteFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------

function JoinCoaching({ guest }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clean = code.replace(/[^a-z0-9]/gi, '')

  const submit = async (e) => {
    e.preventDefault()
    if (guest) { navigate('/login'); return }
    if (clean.length < 4 || busy) return
    setBusy(true)
    setError('')
    try {
      await joinCoaching(clean)
      navigate('/courses')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <section className="card home-join" aria-labelledby="home-join-title">
      <div className="home-join-copy">
        <span className="eyebrow">Step 1</span>
        <h2 id="home-join-title">Join your <span className="scribble">coaching<Scribble /></span></h2>
        <p>Enter the code your coaching gave you. You get their mocks and courses, and the whole app opens up.</p>
        <div className="unlock-row">
          <span className="hue-blue"><i />Practice</span>
          <span className="hue-rose"><i />Daily challenge</span>
          <span className="hue-violet"><i />Mock tests</span>
          <span className="hue-teal"><i />Learn notes</span>
        </div>
      </div>
      <form className="home-join-form" onSubmit={submit}>
        {guest ? (
          <>
            <span className="eyebrow">Already have a code?</span>
            <p className="home-join-guest">Log in first. Your progress and your coaching’s mocks stay with your account.</p>
            <button type="submit" className="btn primary big">Log in to join</button>
          </>
        ) : (
          <>
            <label htmlFor="home-code" className="eyebrow">Referral code</label>
            <input
              id="home-code"
              className="code-input num"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
              placeholder="K7M2QX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={16}
            />
            <button type="submit" className="btn primary big" disabled={busy || clean.length < 4}>
              {busy ? 'Checking…' : 'Join coaching'}
            </button>
            {error ? <p className="error small" role="alert">{error}</p> : <p className="home-join-hint">No code yet? Ask your coaching. The warm-ups below are free.</p>}
          </>
        )}
      </form>
    </section>
  )
}

function Scribble() {
  return (
    <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 14 C 40 6, 80 4, 120 8 S 180 14, 197 7" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

// Questions answered today against the daily goal, as a ring.
function GoalCard({ today }) {
  const R = 50
  const C = 2 * Math.PI * R
  const done = Math.min(1, today / DAILY_GOAL)
  const left = Math.max(0, DAILY_GOAL - today)
  return (
    <div className="card goal">
      <div className="goal-ring">
        <svg width="118" height="118" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={R} className="goal-track" />
          <circle cx="60" cy="60" r={R} className="goal-fill" strokeDasharray={C} strokeDashoffset={C * (1 - done)} transform="rotate(-90 60 60)" />
        </svg>
        <div className="goal-c"><b className="num">{today}</b><span>of {DAILY_GOAL}</span></div>
      </div>
      <div className="goal-body">
        <span className="eyebrow">Today’s goal</span>
        <h3>{left > 0 ? `${left} more question${left === 1 ? '' : 's'}` : 'Goal reached'}</h3>
        <p>{left > 0 ? 'Pick any topic. Every answer counts.' : 'Nice work. Keep the streak going tomorrow.'}</p>
        <a className="btn primary" {...linkProps('/practice')}><Play size={14} /> {today ? 'Continue practice' : 'Start practice'}</a>
      </div>
    </div>
  )
}

function WeekCard({ stats }) {
  const week = stats.week || []
  const streak = Number(stats.streak) || 0
  return (
    <div className="card week">
      <div className="week-head">
        <h3>This week</h3>
        <span><b className="num">{week.reduce((a, d) => a + (Number(d.attempted) || 0), 0)}</b> solved</span>
      </div>
      <div className="week-days" aria-label="Days you practised in the last 7 days">
        {week.map((d, i) => {
          const isToday = i === week.length - 1
          const on = Number(d.attempted) > 0
          const day = WEEKDAY[new Date(`${d.date}T00:00:00`).getDay()]
          return (
            <span key={d.date} className={`week-day${on ? ' done' : ''}${isToday && !on ? ' today' : ''}`} title={d.date}>
              <i>{on ? '✓' : ''}</i>{day}
            </span>
          )
        })}
      </div>
      <p className="week-foot">
        {streak > 0
          ? <><b>🔥 {streak}-day streak.</b> {stats.active_today ? 'Done for today.' : `Practise today to make it ${streak + 1}.`}</>
          : 'Answer one question today to start a streak.'}
      </p>
    </div>
  )
}

// A sticky note on the desk: mistakes due for revision.
function ReviewNote({ due }) {
  return (
    <a className="sticky-note" {...linkProps('/review')}>
      <span className="eyebrow">To revise</span>
      <b className="num">{due}<small>{due === 1 ? 'mistake' : 'mistakes'}</small></b>
      <span className="sticky-note-foot">{due ? <>Open your notebook <ArrowRight size={13} /></> : 'All caught up.'}</span>
    </a>
  )
}

function SubjectTile({ subject: s, stats }) {
  const topics = s.groups.flatMap((g) => g.topics).filter((t) => t.practice === 'quiz')
  const started = topics.filter((t) => Number(stats?.topics?.[t.key]?.attempted) > 0).length
  const pct = topics.length ? Math.round((started / topics.length) * 100) : 0
  return (
    <a className={`subject-tile-card hue-${s.hue}`} {...linkProps(`/practice/${s.key}`)}>
      <s.Icon className="subject-tile-glyph" size={84} strokeWidth={2.2} aria-hidden="true" />
      <span>
        <h3>{s.short}</h3>
        <small>{topics.length} topics</small>
      </span>
      <span className="subject-tile-prog">
        <span>{started} of {topics.length} started</span>
        <span className="subject-tile-bar"><i style={{ width: `${pct}%` }} /></span>
      </span>
    </a>
  )
}

function SpeedRow({ topic, stats }) {
  const score = stats ? speedScore(stats, topic) : null
  const level = speedLevel(score)
  const filled = score === null ? 0 : Math.max(1, Math.round(score / 200))
  return (
    <a className={`drill hue-${topic.hue || 'blue'}`} {...linkProps(practicePath(topic))}>
      <span className="topic-icon"><topic.Icon size={19} /></span>
      <span className="drill-main">
        <span className="drill-name">{topic.name}</span>
        <span className="drill-desc">{topic.desc}</span>
      </span>
      <span className="drill-level" aria-label={score === null ? level.label : `Speed score ${score}: ${level.label}`}>
        <span className="drill-segs">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < filled ? 'f' : ''} />)}</span>
        <span>{score === null ? level.label : `${score} · ${level.label}`}</span>
      </span>
    </a>
  )
}

function CoachingPass({ coaching: c, series, loading }) {
  const place = placeName(c)
  return (
    <article className="card pass">
      <div className="pass-main">
        <div className="pass-head">
          <span className="crest" aria-hidden="true">{(c.name || '?').trim().charAt(0).toUpperCase()}</span>
          <div className="pass-title">
            <h3>{c.name}</h3>
            <span>{[place, series.length ? `Enrolled in ${series.length} test series` : 'Joined'].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        <ul className="pass-rows">
          {loading && <li><Skeleton height={40} radius={12} /></li>}
          {!loading && series.slice(0, 3).map((s) => (
            <li key={s.id}>
              <a {...linkProps(`/series/${s.id}`)}>
                <span>{s.title}</span>
                <span className="pass-meta">{s.mockCount} mock{s.mockCount === 1 ? '' : 's'}</span>
              </a>
            </li>
          ))}
          {!loading && series.length === 0 && (
            <li>
              <a {...linkProps('/courses')}>
                <span>Pick a course to unlock the app</span>
                <span className="pass-meta pass-go">Open Courses <ArrowUpRight size={13} /></span>
              </a>
            </li>
          )}
        </ul>
      </div>
      <div className="pass-side">
        <span className="eyebrow">Your courses</span>
        <b className="num">{loading ? '–' : series.length}<small> of {c.series} on sale</small></b>
        <p>Mocks, results and your rank in this batch live here.</p>
      </div>
    </article>
  )
}

function DailyBanner({ done }) {
  return (
    <section className="daily-banner instrument" aria-labelledby="home-daily-title">
      <span className="daily-banner-icon" aria-hidden="true"><Trophy size={30} /></span>
      <div>
        <h3 id="home-daily-title">Daily challenge</h3>
        <p>{done ? 'Done for today. See where you landed on the leaderboard.' : '10 questions, the same paper for everyone. One attempt a day.'}</p>
      </div>
      <div className="daily-banner-actions">
        <a className="btn ghost daily-banner-review" {...linkProps('/review')}><NotebookPen size={15} /> Notebook</a>
        <a className="btn primary big" {...linkProps('/daily')}>{done ? 'See leaderboard' : 'Play now'} <ArrowRight size={16} /></a>
      </div>
    </section>
  )
}

