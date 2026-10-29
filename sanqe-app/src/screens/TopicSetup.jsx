import { useEffect, useState } from 'react'
import { BookOpen, BookX, Coffee, Timer, Zap } from 'lucide-react'
import { Page } from '../components/Layout'
import { PlanGate } from '../components/PlanGate'
import { EmptyState, Skeleton } from '../components/ui'
import { useApp } from '../lib/appContext'
import { fetchQuestions } from '../lib/api'
import { ALL_SUBJECTS_NOTE, FREE_TOPICS_NOTE, isPaid, levelFor } from '../lib/practice'
import { linkProps, navigate } from '../lib/router'
import { SUBJECT_BY_KEY, learnPath, liveSubject, liveTopic, practicePath } from '../lib/syllabus'
import { FOCUS_MODES, MIN_FOR_SCORE, MODES, intenseSeconds, speedLevel, speedScore } from '../lib/topics'
import { TECHNIQUES, focusActions, useFocus } from '../lib/focus'
import { useCountdown } from '../lib/useCountdown'
import { formatSeconds, formatTime, percent } from '../lib/format'
import { useNotedTopics } from '../lib/useNotedTopics'
import { newTopicRun } from './practiceRun'

export default function TopicSetup({ params }) {
  const topic = liveTopic(params.topic)
  const valid = topic && topic.subject === params.subject && topic.practice === 'quiz'

  useEffect(() => {
    if (valid) return
    // Old links were /practice/<topic>/<anything>.
    const legacy = liveTopic(params.subject)
    if (legacy) navigate(practicePath(legacy), { replace: true, force: true })
    else if (topic) navigate(practicePath(topic), { replace: true, force: true })
    else navigate(liveSubject(params.subject) ? `/practice/${params.subject}` : '/practice', { replace: true, force: true })
  }, [valid, topic, params.subject])
  if (!valid) return null
  return <Setup key={topic.key} topic={topic} />
}

function Setup({ topic }) {
  // What this student may do on this topic: the free topics open fully for
  // everyone; the rest depend on the plan ('none' = a plan is needed, 'mains'
  // = they have Prelims and this is a Mains topic, 'open' = go ahead).
  const { stats, setPractice, hasCourse, guest, practiceAccess } = useApp()
  const access = levelFor(topic.key, practiceAccess)
  const open = access === 'open'
  const backTo = `/practice/${topic.subject}`
  const focus = useFocus()
  const noted = useNotedTopics()
  const focusLeft = useCountdown(focus.phase === 'focus' ? focus.endAt : null)
  const [questions, setQuestions] = useState(null)
  const [error, setError] = useState('')

  // Questions are only asked for once the student is allowed to practise.
  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    fetchQuestions(topic.key)
      .then((qs) => { if (!cancelled) setQuestions(qs) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [topic.key, open])

  const s = stats?.topics?.[topic.key]
  const score = speedScore(s, topic)
  const level = speedLevel(score)
  const attempted = Number(s?.attempted) || 0
  const hasNotes = !!noted[topic.key]

  const start = (mode) => {
    if (!questions?.length) return
    let endAt = null
    if (mode.focus) {
      // Join a focus block that's already running with the same technique,
      // otherwise start a new one.
      endAt = focus.phase === 'focus' && focus.technique === mode.focus && focus.endAt
        ? focus.endAt
        : focusActions.start(mode.focus)
    }
    setPractice(newTopicRun(topic, mode, questions, { endAt }))
    navigate(`${practicePath(topic)}/quiz`)
  }

  const ready = questions && questions.length > 0
  const empty = questions && questions.length === 0

  return (
    <Page backTo={backTo}>
      <div className={`topic-hero hue-${topic.hue}`}>
        <span className="subject-tile big"><topic.Icon size={26} /></span>
        <div>
          <p className="eyebrow">{SUBJECT_BY_KEY[topic.subject].short} · {topic.group}</p>
          <h1 className="heading">{topic.name}</h1>
          <p className="subheading">
            {topic.desc}
          </p>
        </div>
      </div>

      {access === 'none' && (
        <PlanGate title={`${topic.name} needs a Practice plan`} returnTo={practicePath(topic)} returnLabel={topic.name}>
          A plan opens every Prelims topic in {ALL_SUBJECTS_NOTE}; Prelims + Mains adds the Mains sets. {FREE_TOPICS_NOTE} stay free.
        </PlanGate>
      )}
      {access === 'mains' && (
        <PlanGate title={`${topic.name} is in the Prelims + Mains plans`} returnTo={practicePath(topic)} returnLabel={topic.name} tier="full">
          Your plan covers the Prelims topics. Prelims + Mains opens the Mains sets too, and the Mistake Notebook.
        </PlanGate>
      )}
      {access === 'checking' && (
        <div className="duration-grid" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={104} radius={12} />)}
        </div>
      )}

      {attempted > 0 && open && (
        <div className="mini-stats">
          <div><strong>{attempted}</strong><span>solved</span></div>
          <div><strong>{percent(Number(s.correct), attempted)}%</strong><span>accuracy</span></div>
          <div><strong>{formatSeconds(s.recent_avg_ms)}</strong><span>avg · target {topic.targetSec}s</span></div>
          <div>
            <strong className={`tone-${level.tone}`}>{score ?? '—'}</strong>
            <span>{score === null ? `Speed Score at ${MIN_FOR_SCORE}` : level.label}</span>
          </div>
        </div>
      )}

      {open && !questions && !error && (
        <div className="duration-grid" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={104} radius={12} />)}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {empty && (
        <EmptyState
          icon={BookX}
          title="No questions here yet"
          action={<a className="btn" {...linkProps(backTo)}>Other {SUBJECT_BY_KEY[topic.subject].short} topics</a>}
        >
          Questions for {topic.name} are being added. Meanwhile, pick another topic{hasNotes && hasCourse ? ' or revise the notes below' : ''}.
        </EmptyState>
      )}

      {ready && (
        <>
          <h2 className="section-title">Timed practice</h2>
          <div className="duration-grid">
            {MODES.map((m) => (
              <button key={m.key} type="button" className={`card duration-card${m.mode === 'intense' ? ' intense' : ''}`} onClick={() => start(m)}>
                <span className="duration-icon">{m.mode === 'intense' ? <Zap size={18} /> : <Timer size={18} />}</span>
                <span className="duration-label">{m.label}</span>
                <span className="duration-tag">{m.mode === 'intense' ? `${intenseSeconds(topic)} sec per question · unanswered = wrong` : m.tag}</span>
              </button>
            ))}
          </div>

          {!guest && <>
          <h2 className="section-title">Focus session</h2>
          <div className="focus-modes">
            {FOCUS_MODES.map((m) => {
              const t = TECHNIQUES[m.focus]
              const joining = focus.phase === 'focus' && focus.technique === m.focus && focus.endAt
              return (
                <button key={m.key} type="button" className="card focus-mode" onClick={() => start(m)}>
                  <span className="focus-mode-icon"><Coffee size={18} /></span>
                  <span className="focus-mode-body">
                    <span className="focus-mode-name">{t.name}</span>
                    <span className="focus-mode-tag">
                      {joining ? `Continue the running block · ${formatTime(focusLeft ?? 0)} left` : t.summary}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="hint">
            The break starts by itself when the block ends.
            {isPaid(practiceAccess) && <> Manage rounds on the <a {...linkProps('/focus')}>focus timer</a>.</>}
          </p>
          </>}
          {guest && (
            <p className="hint">Practising without an account: your answers aren’t saved. <a {...linkProps('/login')}>Log in</a> to get a Speed Score and keep a streak.</p>
          )}
        </>
      )}

      {hasNotes && hasCourse && (
        <a className="card learn-link" {...linkProps(learnPath(topic))}>
          <BookOpen size={18} />
          <span><strong>Revise first</strong> — rules, shortcuts and tables for {topic.name}.</span>
        </a>
      )}
    </Page>
  )
}
