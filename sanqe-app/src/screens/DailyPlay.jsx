import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Send, Timer } from 'lucide-react'
import { SiteLogo } from '../components/Logo'
import { Modal, Skeleton } from '../components/ui'
import { useApp } from '../lib/appContext'
import { fetchDailyChallenge, submitDailyChallenge } from '../lib/api'
import { navigate, useNavigationBlocker } from '../lib/router'
import { readStore, userKey, writeStore } from '../lib/storage'
import { OPT_KEYS, TOPIC_BY_KEY } from '../lib/topics'
import { useCountdown } from '../lib/useCountdown'
import { formatTime } from '../lib/format'

export default function DailyPlay() {
  const [challenge, setChallenge] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchDailyChallenge()
      .then((c) => {
        if (cancelled) return
        if (c.already_done) navigate('/daily', { replace: true, force: true })
        else setChallenge(c)
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <main className="page">
        <p className="error" role="alert">{error}</p>
        <button type="button" className="btn" onClick={() => navigate('/daily', { replace: true })}>Back</button>
      </main>
    )
  }
  if (!challenge) return <main className="page"><Skeleton height={320} radius={16} /></main>
  return <Player challenge={challenge} />
}

function Player({ challenge }) {
  const { user, refreshStats } = useApp()
  const storeKey = userKey(user.id, `daily:${challenge.date}`)
  const questions = challenge.questions
  const keyOf = (q) => `${q.topic}:${q.id}`

  // Progress survives a refresh: same start time (so the clock keeps
  // running), same answers.
  const [saved] = useState(() => {
    const s = readStore(storeKey, null)
    if (s && typeof s.startedAt === 'number') return s
    const fresh = { startedAt: Date.now(), answers: {}, times: {} }
    writeStore(storeKey, fresh)
    return fresh
  })
  const [answers, setAnswers] = useState(saved.answers || {})
  const timesRef = useRef({ ...(saved.times || {}) })
  const [index, setIndex] = useState(0)
  const shownAtRef = useRef(Date.now())
  const [confirm, setConfirm] = useState(false)
  const [leaving, setLeaving] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submittedRef = useRef(false)

  const endAt = saved.startedAt + challenge.time_limit_sec * 1000

  // Charge the time spent on the current question before moving away.
  const bankTime = useCallback(() => {
    const q = questions[index]
    if (!q) return
    const now = Date.now()
    timesRef.current[keyOf(q)] = (timesRef.current[keyOf(q)] || 0) + (now - shownAtRef.current)
    shownAtRef.current = now
  }, [questions, index])

  const persist = useCallback((nextAnswers) => {
    writeStore(storeKey, { startedAt: saved.startedAt, answers: nextAnswers, times: timesRef.current })
  }, [storeKey, saved.startedAt])

  const goTo = (i) => {
    bankTime()
    persist(answers)
    setIndex(i)
  }

  const choose = (opt) => {
    const k = keyOf(questions[index])
    const next = { ...answers, [k]: answers[k] === opt ? undefined : opt }
    if (next[k] === undefined) delete next[k]
    setAnswers(next)
    persist(next)
  }

  const submit = useCallback(async () => {
    if (submittedRef.current) return
    submittedRef.current = true
    bankTime()
    setSubmitting(true)
    setConfirm(false)
    setError('')
    try {
      const elapsed = Math.min(Date.now() - saved.startedAt, challenge.time_limit_sec * 1000)
      await submitDailyChallenge({ date: challenge.date, answers, times: timesRef.current, timeMs: elapsed })
      writeStore(storeKey, null)
      refreshStats()
      navigate('/daily', { replace: true, force: true })
    } catch (e) {
      if (e.code === '23505') {
        writeStore(storeKey, null)
        navigate('/daily', { replace: true, force: true })
        return
      }
      submittedRef.current = false
      setSubmitting(false)
      setError(e.message)
    }
  }, [answers, bankTime, challenge, saved.startedAt, storeKey, refreshStats])

  const secondsLeft = useCountdown(endAt, submit)

  useNavigationBlocker(submittedRef.current ? null : (proceed) => setLeaving(() => proceed))

  const q = questions[index]
  const answeredCount = Object.keys(answers).length
  const mine = answers[keyOf(q)]
  const topic = TOPIC_BY_KEY[q.topic]

  return (
    <main className="page quiz-page">
      <header className="quiz-top">
        <div className="quiz-left">
          <SiteLogo className="quiz-logo" />
          <h1 className="quiz-topic">Daily Challenge <span className="quiz-mode">{answeredCount}/{questions.length} answered</span></h1>
        </div>
        <div className="quiz-right">
          <span className={`timer${secondsLeft !== null && secondsLeft <= 60 ? ' low' : ''}`} role="timer">
            <Timer size={15} /> {formatTime(secondsLeft ?? 0)}
          </span>
          <button type="button" className="btn primary small" onClick={() => setConfirm(true)} disabled={submitting}>
            <Send size={14} /> Submit
          </button>
        </div>
      </header>

      <nav className="palette" aria-label="Questions">
        {questions.map((qq, i) => (
          <button
            key={keyOf(qq)}
            type="button"
            className={`palette-btn${i === index ? ' current' : ''}${answers[keyOf(qq)] ? ' answered' : ''}`}
            onClick={() => goTo(i)}
            aria-label={`Question ${i + 1}${answers[keyOf(qq)] ? ', answered' : ''}`}
            aria-current={i === index ? 'true' : undefined}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <section className="card question-card" key={index}>
        <div className="q-label">
          <span>Question {index + 1} of {questions.length}</span>
          <span className={`pill hue-${topic?.hue}`}>{topic?.short}</span>
        </div>
        <div className="q-text">{q.question}</div>
        <div className="options" role="radiogroup" aria-label="Options">
          {OPT_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={mine === k}
              className={`option${mine === k ? ' chosen' : ''}`}
              onClick={() => choose(k)}
              disabled={submitting}
            >
              <span className="opt-key">{k.toUpperCase()}</span>
              <span className="opt-text">{q[`option_${k}`]}</span>
            </button>
          ))}
        </div>
        <div className="feedback-row nav-row">
          <button type="button" className="btn ghost" onClick={() => goTo(index - 1)} disabled={index === 0}><ArrowLeft size={15} /> Previous</button>
          {index < questions.length - 1
            ? <button type="button" className="btn primary" onClick={() => goTo(index + 1)}>Next <ArrowRight size={15} /></button>
            : <button type="button" className="btn primary" onClick={() => setConfirm(true)} disabled={submitting}>Review &amp; submit</button>}
        </div>
        <p className="kbd-hint">Tap an answer again to clear it.</p>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {submitting && <p className="info">Submitting…</p>}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Submit your answers?"
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Keep going</button>
            <button type="button" className="btn primary" onClick={submit}>Submit</button>
          </>
        )}
      >
        <p>
          You&apos;ve answered {answeredCount} of {questions.length}.
          {answeredCount < questions.length ? ` ${questions.length - answeredCount} unanswered will count as wrong.` : ''} You can&apos;t change answers after submitting.
        </p>
      </Modal>

      <Modal
        open={!!leaving}
        onClose={() => setLeaving(null)}
        title="Leave the challenge?"
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setLeaving(null)}>Stay</button>
            <button type="button" className="btn" onClick={() => { bankTime(); persist(answers); const go = leaving; setLeaving(null); go() }}>Leave</button>
          </>
        )}
      >
        <p>Your answers are saved on this device, but <strong>the clock keeps running</strong>. If time runs out while you&apos;re away, whatever you&apos;ve answered is submitted the next time you open the challenge.</p>
      </Modal>
    </main>
  )
}
