import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Timer, X } from 'lucide-react'
import { SiteLogo } from '../components/Logo'
import { Solution } from '../components/Solution'
import { Modal } from '../components/ui'
import { useApp } from '../lib/appContext'
import { recordAttempt, saveSession } from '../lib/api'
import { HAPTIC_CORRECT, HAPTIC_WRONG, vibrate } from '../lib/haptics'
import { navigate, useNavigationBlocker } from '../lib/router'
import { TOPIC_BY_KEY, isDiTopic } from '../lib/topics'
import { practicePath } from '../lib/syllabus'
import { QuestionBody, optionKeys } from '../components/Question'
import { RichText } from '../components/RichText'
import { ReportQuestion } from '../components/ReportQuestion'
import { useCountdown, useElapsed } from '../lib/useCountdown'
import { formatTime, percent } from '../lib/format'
import { summarize } from './practiceRun'

export default function Quiz({ params, path }) {
  const { practice: run } = useApp()
  const isReview = path.startsWith('/review')
  const matches = run && (isReview ? run.kind === 'review' : run.kind === 'topic' && run.topicKey === params.topic)
  const fallback = isReview ? '/review' : `/practice/${params.subject}/${params.topic}`

  useEffect(() => {
    // Refreshed mid-test (the run lives in memory) or opened by URL: go to
    // the setup screen. A finished run belongs on its results screen.
    if (!matches) navigate(fallback, { replace: true, force: true })
    else if (run.finished) navigate(`${fallback}/results`, { replace: true, force: true })
  }, [matches, run, fallback])

  if (!matches || run.finished) return null
  return <QuizRunner key={run.id} run={run} isReview={isReview} />
}

function QuizRunner({ run, isReview }) {
  // Logged out (free speed maths), nothing is saved: there's no account to save to.
  const { setPractice, refreshStats, guest } = useApp()
  const topic = run.topicKey ? TOPIC_BY_KEY[run.topicKey] : null
  const total = run.questions.length
  // DI topics (di_*, m_di_*) are practised one set at a time. A set is the
  // run of questions sharing one passage/chart. Inside a set the student steps
  // back and forth, skipping and returning; after the last question the next
  // set (in random order) opens. Sets never show how many there are in all.
  const browse = run.kind === 'topic' && isDiTopic(run.topicKey)
  const sets = useMemo(() => {
    if (!browse) return []
    const out = []
    let prevKey = null
    run.questions.forEach((q, i) => {
      const key = q.passage || q.image_url ? `${q.passage || ''}|${q.image_url || ''}` : null
      if (key !== null && key === prevKey) out[out.length - 1].push(i)
      else out.push([i])
      prevKey = key
    })
    return out
  }, [browse, run.questions])
  const setOfIndex = useMemo(() => {
    const m = []
    sets.forEach((idxs, si) => idxs.forEach((i) => { m[i] = si }))
    return m
  }, [sets])
  const setQueueRef = useRef(null) // shuffled set numbers still to come

  // ---- question order ----
  // Topic runs: shuffle the whole pool and deal it out; reshuffle when it
  // runs dry (never repeating the question just shown). Review runs: one pass.
  const queueRef = useRef([])
  const lastIdxRef = useRef(-1)
  const drawIndex = useCallback(() => {
    if (browse) {
      if (setQueueRef.current === null) {
        const order = sets.map((_, i) => i)
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[order[i], order[j]] = [order[j], order[i]]
        }
        setQueueRef.current = order
      }
      const n = setQueueRef.current.shift()
      return n === undefined ? null : sets[n][0]
    }
    if (run.kind === 'review') {
      const next = lastIdxRef.current + 1
      return next < total ? next : null
    }
    if (queueRef.current.length === 0) {
      const order = Array.from({ length: total }, (_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      if (order.length > 1 && order[order.length - 1] === lastIdxRef.current) {
        ;[order[0], order[order.length - 1]] = [order[order.length - 1], order[0]]
      }
      queueRef.current = order
    }
    return queueRef.current.pop()
  }, [run.kind, total, browse, sets])

  // Draw the first question exactly once (a useState initializer may run
  // twice in StrictMode, which would skip a question in review runs).
  const firstRef = useRef(null)
  if (firstRef.current === null) {
    const i = drawIndex()
    lastIdxRef.current = i
    firstRef.current = { index: i, shownAt: Date.now() }
  }
  const [current, setCurrent] = useState(firstRef.current)
  const question = run.questions[current.index]
  const [selected, setSelected] = useState(null) // null | 'a'..'e' | 'timeout'
  const [answeredAt, setAnsweredAt] = useState(null)
  const [log, setLog] = useState([])
  const logRef = useRef([])
  const pendingSaves = useRef([])
  const finishedRef = useRef(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const nextBtnRef = useRef(null)
  const visitedRef = useRef({}) // browse runs: index -> { selected, answeredAt, shownAt }
  const qLimit = browse ? null : run.questionSeconds

  // ---- finishing ----
  const finish = useCallback((reason) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const finalLog = logRef.current
    const sum = summarize(finalLog)
    const finishedAt = Date.now()
    setPractice({ ...run, log: finalLog, finished: true, endedReason: reason, finishedAt })
    if (sum.attempted > 0 && !guest) {
      pendingSaves.current.push(saveSession({
        topic: run.topicKey || 'review',
        mode: run.mode,
        duration_sec: Math.round((finishedAt - run.startedAt) / 1000),
        attempted: sum.attempted,
        correct: sum.correct,
        wrong: sum.wrong,
        avg_time_ms: sum.avgMs,
      }))
    }
    Promise.allSettled(pendingSaves.current).then(() => refreshStats())
    navigate(isReview ? '/review/results' : `${practicePath(TOPIC_BY_KEY[run.topicKey])}/results`, { replace: true, force: true })
  }, [run, setPractice, refreshStats, isReview, guest])

  // ---- clocks ----
  const secondsLeft = useCountdown(run.endAt, () => finish('time'))
  const qElapsed = useElapsed(current.shownAt, answeredAt)

  // ---- answering ----
  const pushLog = (entry) => {
    logRef.current = [...logRef.current, entry]
    setLog(logRef.current)
    if (guest) return
    pendingSaves.current.push(recordAttempt({
      topic: entry.question.topic,
      questionId: entry.question.id,
      selected: entry.selected,
      timeMs: entry.timeMs,
      mode: run.mode,
    }))
  }

  const answer = (key) => {
    if (selected || finishedRef.current) return
    const now = Date.now()
    const correct = key === question.correct_option
    setSelected(key)
    setAnsweredAt(now)
    vibrate(correct ? HAPTIC_CORRECT : HAPTIC_WRONG)
    pushLog({ question, selected: key, correct, timeMs: now - current.shownAt })
  }

  // Browse runs: save this question's state, then show another one of the
  // same set, or the first of the next set (or finish when none are left).
  const curSet = browse ? sets[setOfIndex[current.index]] : null
  const posInSet = curSet ? curSet.indexOf(current.index) : 0
  const moreSets = browse && (setQueueRef.current?.length ?? 0) > 0
  const go = (delta) => {
    if (finishedRef.current) return
    const t = posInSet + delta
    if (t < 0) return
    visitedRef.current[current.index] = { selected, answeredAt, shownAt: current.shownAt }
    let target
    if (t >= curSet.length) {
      target = drawIndex()
      if (target === null || target === undefined) { finish('complete'); return }
    } else {
      target = curSet[t]
    }
    const seen = visitedRef.current[target]
    const answered = !!seen?.selected
    setCurrent({ index: target, shownAt: answered ? seen.shownAt : Date.now() })
    setSelected(answered ? seen.selected : null)
    setAnsweredAt(answered ? seen.answeredAt : null)
  }

  const timeOut = useCallback(() => {
    if (selected || finishedRef.current) return
    setSelected('timeout')
    setAnsweredAt(Date.now())
    vibrate(HAPTIC_WRONG)
    pushLog({ question, selected: null, correct: false, timeMs: run.questionSeconds * 1000 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, question, run.questionSeconds])

  const next = useCallback(() => {
    if (finishedRef.current) return
    const i = drawIndex()
    if (i === null || i === undefined) {
      finish('complete')
      return
    }
    lastIdxRef.current = i
    setCurrent({ index: i, shownAt: Date.now() })
    setSelected(null)
    setAnsweredAt(null)
  }, [drawIndex, finish])

  // Intense mode: the per-question clock forces a timeout.
  useEffect(() => {
    if (qLimit && !selected && qElapsed >= qLimit) timeOut()
  }, [qElapsed, selected, qLimit, timeOut])

  // After a timeout, move on by itself so the sprint keeps its rhythm.
  useEffect(() => {
    if (selected !== 'timeout') return undefined
    const t = setTimeout(next, 1500)
    return () => clearTimeout(t)
  }, [selected, next])

  useEffect(() => {
    if (selected && selected !== 'timeout') nextBtnRef.current?.focus({ preventScroll: true })
  }, [selected])

  // Keyboard: A–E or 1–5 to answer, Enter / → to continue.
  useEffect(() => {
    const onKey = (e) => {
      if (confirmEnd || e.ctrlKey || e.metaKey || e.altKey) return
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      const k = e.key.toLowerCase()
      if (browse && e.target === document.body && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        go(e.key === 'ArrowLeft' ? -1 : 1)
        return
      }
      if (!selected) {
        const keys = optionKeys(question)
        const idx = keys.indexOf(k) !== -1 ? keys.indexOf(k) : ['1', '2', '3', '4', '5'].indexOf(k)
        if (idx !== -1 && idx < keys.length) { e.preventDefault(); answer(keys[idx]) }
      } else if (selected !== 'timeout' && (e.key === 'Enter' || e.key === 'ArrowRight') && e.target === document.body) {
        e.preventDefault()
        if (browse) go(1)
        else next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Leaving mid-test (back button, nav) asks first; closing the tab warns.
  useNavigationBlocker(finishedRef.current ? null : () => setConfirmEnd(true))
  useEffect(() => {
    const warn = (e) => { if (!finishedRef.current && logRef.current.length > 0) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const sum = summarize(log)
  const timeLow = secondsLeft !== null && secondsLeft <= 60
  const qLeft = qLimit ? Math.max(qLimit - qElapsed, 0) : null
  const progress = run.endAt
    ? 1 - (secondsLeft ?? 0) / run.durationSec
    : (sum.attempted) / Math.max(total, 1)
  const isCorrect = selected && selected === question.correct_option

  return (
    <main className="page quiz-page">
      <header className="quiz-top">
        <div className="quiz-left">
          <SiteLogo className="quiz-logo" />
          <h1 className="quiz-topic">
            {topic ? <><topic.Icon size={15} /> {topic.name}</> : 'Mistake review'}
            <span className="quiz-mode">{run.modeLabel}</span>
          </h1>
        </div>
        <div className="quiz-right">
          {run.endAt ? (
            <span className={`timer${timeLow ? ' low' : ''}`} role="timer" aria-label={`Time left ${formatTime(secondsLeft ?? 0)}`}>
              <Timer size={15} /> {formatTime(secondsLeft ?? 0)}
            </span>
          ) : (
            <span className="timer">Attempted {sum.attempted}</span>
          )}
          <button type="button" className="btn danger small" onClick={() => setConfirmEnd(true)}>End</button>
        </div>
      </header>
      <div className="quiz-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} /></div>

      <div className="scoreline" aria-live="polite">
        <span>Attempted <b>{sum.attempted}</b></span>
        <span className="ok">Correct <b>{sum.correct}</b></span>
        <span className="bad">Wrong <b>{sum.wrong}</b></span>
        <span>Accuracy <b>{percent(sum.correct, sum.attempted)}%</b></span>
      </div>

      <section className={`card question-card${selected ? (isCorrect ? ' answered-right' : ' answered-wrong') : ''}`} key={current.shownAt}>
        <div className="q-label">
          <span>Question {browse ? `${posInSet + 1} of ${curSet.length}` : sum.attempted + (selected ? 0 : 1)}{isReview && question.topic ? ` · ${TOPIC_BY_KEY[question.topic]?.short}` : ''}</span>
          <span className={`q-timer${qLimit && qLeft <= 10 && !selected ? ' low' : ''}`}>
            <Timer size={12} /> {qLimit ? `${qLeft}s left` : formatTime(qElapsed)}
          </span>
        </div>
        <QuestionBody question={question} />
        <div className="options" role="group" aria-label="Options">
          {optionKeys(question).map((k) => {
            const isSel = selected === k
            const isKey = question.correct_option === k
            let cls = 'option'
            if (selected) {
              if (isKey) cls += ' correct'
              else if (isSel) cls += ' incorrect'
              else cls += ' muted'
            }
            return (
              <button key={k} type="button" className={cls} onClick={() => answer(k)} disabled={!!selected} aria-keyshortcuts={k.toUpperCase()}>
                <span className="opt-key">{selected && isKey ? <Check size={14} /> : selected && isSel ? <X size={14} /> : k.toUpperCase()}</span>
                <span className="opt-text"><RichText text={question[`option_${k}`]} /></span>
              </button>
            )
          })}
        </div>

        {selected && (
          <>
            <div className="feedback-row" role="status">
              <span className={isCorrect ? 'ok' : 'bad'}>
                {isCorrect
                  ? `Correct! ${formatTime(Math.round((answeredAt - current.shownAt) / 1000))}`
                  : selected === 'timeout'
                    ? `Time's up — answer is (${question.correct_option.toUpperCase()})`
                    : `Wrong — answer is (${question.correct_option.toUpperCase()})`}
              </span>
              {selected === 'timeout'
                ? <span className="timeout-note">Next question…</span>
                : browse ? null : (
                  <button type="button" ref={nextBtnRef} className="btn primary" onClick={next}>
                    {isReview && current.index === total - 1 ? 'Finish' : 'Next'} <ArrowRight size={15} />
                  </button>
                )}
            </div>
            <Solution question={question} defaultOpen={!isCorrect} key={`sol-${current.shownAt}`} />
            {selected !== 'timeout' && <div className="report-row"><ReportQuestion topic={question.topic} questionId={question.id} /></div>}
          </>
        )}
        {browse && (
          <nav className="q-nav" aria-label="Question navigation">
            <button type="button" className="btn" onClick={() => go(-1)} disabled={posInSet === 0}>
              <ArrowLeft size={15} /> Previous
            </button>
            <span className="q-nav-pos">{posInSet + 1} / {curSet.length}</span>
            <button type="button" ref={nextBtnRef} className="btn primary" onClick={() => go(1)}>
              {posInSet < curSet.length - 1 ? 'Next' : moreSets ? 'Next set' : 'Finish'} <ArrowRight size={15} />
            </button>
          </nav>
        )}
        {!selected && <p className="kbd-hint">Tip: press {optionKeys(question).length === 4 ? 'A–D' : 'A–E'} to answer, {browse ? '← → to move between questions.' : 'Enter for next.'}</p>}
      </section>

      <Modal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End this test?"
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setConfirmEnd(false)}>Keep going</button>
            <button type="button" className="btn primary" onClick={() => { setConfirmEnd(false); finish('manual') }}>End &amp; see results</button>
          </>
        )}
      >
        <p>{sum.attempted > 0
          ? `You've answered ${sum.attempted} question${sum.attempted === 1 ? '' : 's'}. ${guest ? 'Without an account nothing is saved' : 'Every answer is already saved'} — you'll see your results next.`
          : "You haven't answered anything yet."}</p>
      </Modal>
    </main>
  )
}
