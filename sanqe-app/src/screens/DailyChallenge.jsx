import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, Clock, Crown, Medal, Trophy, X, Zap } from 'lucide-react'
import { Page } from '../components/Layout'
import { Solution } from '../components/Solution'
import { ReportQuestion } from '../components/ReportQuestion'
import { EmptyState, Skeleton } from '../components/ui'
import { useApp } from '../lib/appContext'
import { fetchDailyChallenge, fetchLeaderboard } from '../lib/api'
import { navigate } from '../lib/router'
import { TOPIC_BY_KEY } from '../lib/topics'
import { formatTime } from '../lib/format'
import { readStore, userKey } from '../lib/storage'

export default function DailyChallenge() {
  const { user, refreshStats } = useApp()
  const [challenge, setChallenge] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setChallenge(await fetchDailyChallenge())
      setState('ready')
    } catch (e) {
      setState(e.missingSchema ? 'unavailable' : 'error')
      setError(e.message)
    }
  }, [])
  useEffect(() => { load(); refreshStats() }, [load, refreshStats])

  return (
    <Page title="Daily Challenge" subtitle="Same 15 questions for everyone, every day. One attempt. Fastest perfect score tops the board.">
      {state === 'loading' && <Skeleton height={180} radius={16} />}
      {state === 'unavailable' && (
        <EmptyState icon={Zap} title="Daily Challenge is coming soon">
          The leaderboard is being set up. Meanwhile, sharpen up in Practice.
        </EmptyState>
      )}
      {state === 'error' && <p className="error" role="alert">{error}</p>}

      {state === 'ready' && !challenge.already_done && (
        <section className="card daily-intro">
          <span className="daily-icon big"><Zap size={30} /></span>
          <h2>Today&apos;s challenge is live</h2>
          <ul className="rules">
            <li><strong>15 questions</strong> — 3 each from Simplification, Approximation, Number Series, Wrong Number Series and Quadratics.</li>
            <li><strong>10 minutes</strong> on one clock. Jump between questions and change answers until you submit.</li>
            <li><strong>One attempt per day.</strong> Ranked by score, then by time taken.</li>
            <li>Solutions and the leaderboard unlock as soon as you submit.</li>
          </ul>
          <StartButton challenge={challenge} userId={user.id} />
          <Leaderboard date={challenge.date} title="Today so far" compact />
        </section>
      )}

      {state === 'ready' && challenge.already_done && <DoneView challenge={challenge} />}
    </Page>
  )
}

// "Resume" when an attempt was started on this device and left midway.
function StartButton({ challenge, userId }) {
  const saved = readStore(userKey(userId, `daily:${challenge.date}`), null)
  const startedAt = saved && typeof saved.startedAt === 'number' ? saved.startedAt : null
  const leftSec = startedAt ? Math.max(0, Math.round((startedAt + challenge.time_limit_sec * 1000 - Date.now()) / 1000)) : null
  let label = 'Start challenge'
  if (startedAt) label = leftSec > 0 ? `Resume · ${formatTime(leftSec)} left` : 'Time up — submit saved answers'
  return (
    <button type="button" className="btn primary big" onClick={() => navigate('/daily/play')}>
      {label} <ArrowRight size={16} />
    </button>
  )
}

function DoneView({ challenge }) {
  const { score, total, time_ms: timeMs, answers } = challenge.result
  const [tab, setTab] = useState('board')
  const [day, setDay] = useState('today')
  const yesterday = new Date(`${challenge.date}T00:00:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  const yDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  return (
    <>
      <section className="card daily-result">
        <span className="daily-icon big"><Trophy size={28} /></span>
        <div>
          <p className="muted small">Today&apos;s score</p>
          <p className="daily-score">{score}<span>/{total}</span></p>
          <p className="muted"><Clock size={14} /> {formatTime(Math.round(timeMs / 1000))} · new challenge at midnight (IST)</p>
        </div>
      </section>

      <div className="segmented" role="radiogroup" aria-label="View">
        <button type="button" role="radio" aria-checked={tab === 'board'} className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>Leaderboard</button>
        <button type="button" role="radio" aria-checked={tab === 'review'} className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Solutions</button>
      </div>

      {tab === 'board' && (
        <>
          <div className="segmented small" role="radiogroup" aria-label="Day">
            <button type="button" role="radio" aria-checked={day === 'today'} className={day === 'today' ? 'active' : ''} onClick={() => setDay('today')}>Today</button>
            <button type="button" role="radio" aria-checked={day === 'yesterday'} className={day === 'yesterday' ? 'active' : ''} onClick={() => setDay('yesterday')}>Yesterday</button>
          </div>
          <Leaderboard date={day === 'today' ? challenge.date : yDate} key={day} />
        </>
      )}

      {tab === 'review' && (
        <ol className="review-items">
          {challenge.questions.map((q) => {
            const mine = answers?.[`${q.topic}:${q.id}`] || null
            const right = mine && mine === q.correct_option
            return (
              <li key={`${q.topic}:${q.id}`} className={`card review-item ${right ? 'is-right' : 'is-wrong'}`}>
                <div className="review-head">
                  <span className="review-num">Q{q.pos}</span>
                  <span className={`pill hue-${TOPIC_BY_KEY[q.topic]?.hue}`}>{TOPIC_BY_KEY[q.topic]?.short}</span>
                  <span className={`review-badge ${right ? 'ok' : 'bad'}`}>
                    {right ? <Check size={13} /> : <X size={13} />} {right ? 'Correct' : mine ? 'Wrong' : 'Skipped'}
                  </span>
                </div>
                <p className="review-q">{q.question}</p>
                <p className="review-answers">
                  {mine && !right && <span className="bad">Your answer: ({mine.toUpperCase()}) {q[`option_${mine}`]}</span>}
                  <span className="ok">Answer: ({q.correct_option.toUpperCase()}) {q[`option_${q.correct_option}`]}</span>
                </p>
                <Solution question={q} />
                <div className="report-row"><ReportQuestion topic={q.topic} questionId={q.id} /></div>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}

function Leaderboard({ date, title, compact = false }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchLeaderboard(date)
      .then((r) => { if (!cancelled) setRows(r) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [date])

  if (error) return <p className="error small">{error}</p>
  if (!rows) return <Skeleton height={compact ? 80 : 220} radius={12} style={{ marginTop: 16 }} />

  const list = compact ? rows.filter((r) => r.rank <= 3) : rows
  return (
    <section className={`leaderboard${compact ? ' compact' : ''}`}>
      {title && <h3>{title}</h3>}
      {list.length === 0 ? (
        <p className="muted small">{compact ? 'Nobody has played yet today — be the first on the board.' : 'No scores for this day.'}</p>
      ) : (
        <ol>
          {list.map((r) => (
            <li key={`${r.rank}-${r.display_name}-${r.time_ms}`} className={r.is_me ? 'me' : ''}>
              <span className={`rank rank-${r.rank}`}>
                {r.rank === 1 ? <Crown size={15} /> : r.rank <= 3 ? <Medal size={15} /> : r.rank}
              </span>
              <span className="lb-name">{r.display_name}{r.is_me ? ' (you)' : ''}</span>
              <span className="lb-score">{r.score}/{r.total}</span>
              <span className="lb-time">{formatTime(Math.round(r.time_ms / 1000))}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
