import { useEffect, useState } from 'react'
import { Check, Clock, Coffee, Hourglass, NotebookPen, Play, RotateCcw, X } from 'lucide-react'
import { Page } from '../components/Layout'
import { Solution } from '../components/Solution'
import { Donut, Ring } from '../components/ui'
import { useApp } from '../lib/appContext'
import { navigate } from '../lib/router'
import { MODE_BY_KEY, TOPIC_BY_KEY } from '../lib/topics'
import { practicePath } from '../lib/syllabus'
import { TECHNIQUES, focusActions, phaseMinutes, useFocus } from '../lib/focus'
import { useCountdown } from '../lib/useCountdown'
import { QuestionBody } from '../components/Question'
import { RichText } from '../components/RichText'
import { ReportQuestion } from '../components/ReportQuestion'
import { formatSeconds, formatTime, percent } from '../lib/format'
import { newTopicRun, summarize } from './practiceRun'

const HEADINGS = {
  time: "Time's up!",
  manual: 'Test ended',
  complete: 'Review complete',
}

export default function Results({ params, path }) {
  const { practice: run, setPractice, practiceAccess, guest } = useApp()
  const isReview = path.startsWith('/review')
  const valid = run && run.finished && (isReview ? run.kind === 'review' : run.topicKey === params.topic && run.subject === params.subject)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!valid) navigate(isReview ? '/review' : `/practice/${params.subject}/${params.topic}`, { replace: true })
  }, [valid, isReview, params.subject, params.topic])
  if (!valid) return null

  const topic = run.topicKey ? TOPIC_BY_KEY[run.topicKey] : null
  const sum = summarize(run.log)
  const accuracy = percent(sum.correct, sum.attempted)
  const indexed = run.log.map((entry, i) => ({ entry, n: i + 1 }))
  const shown = filter === 'wrong' ? indexed.filter(({ entry }) => !entry.correct) : indexed

  const again = (endAt = null) => {
    const mode = MODE_BY_KEY[run.modeKey]
    if (!topic || !mode) return
    setPractice(newTopicRun(topic, mode, run.questions, { endAt }))
    navigate(`${practicePath(topic)}/quiz`, { replace: true })
  }

  let paceNote = null
  if (topic && sum.avgMs) {
    const avg = sum.avgMs / 1000
    const fast = avg <= topic.targetSec
    if (fast && accuracy < 70) {
      paceNote = `You're quick (${formatSeconds(sum.avgMs)} a question, target ${topic.targetSec}s) but only ${accuracy}% were right. Slow down slightly — accuracy first, then speed.`
    } else if (fast) {
      paceNote = `You averaged ${formatSeconds(sum.avgMs)} per question with ${accuracy}% accuracy — inside the ${topic.targetSec}s exam-ready pace. Keep it up.`
    } else {
      paceNote = `You averaged ${formatSeconds(sum.avgMs)} per question. Exam-ready pace for ${topic.name} is about ${topic.targetSec}s — ${Math.max(1, Math.round(avg - topic.targetSec))}s to shave off.`
    }
  }

  return (
    <Page backTo={isReview ? '/review' : `/practice/${run.subject}`} className="results-page">
      <section className="card results-card">
        <p className="results-kicker">{topic ? `${topic.name} · ${run.modeLabel}` : 'Mistake Notebook'}</p>
        <h1>{run.focus && run.endedReason === 'time' ? 'Round complete' : HEADINGS[run.endedReason] || 'Results'}</h1>

        <div className="results-summary">
          <Donut
            label={`${sum.correct} correct, ${sum.wrong - sum.timedOut} wrong, ${sum.timedOut} timed out`}
            segments={[
              { key: 'c', value: sum.correct, color: 'var(--green)' },
              { key: 'w', value: sum.wrong - sum.timedOut, color: 'var(--red)' },
              { key: 't', value: sum.timedOut, color: 'var(--amber)' },
            ]}
            center={<><span className="donut-num">{accuracy}%</span><span className="donut-cap">accuracy</span></>}
          />
          <div className="results-grid">
            <div className="stat"><span className="stat-num">{sum.attempted}</span><span>Attempted</span></div>
            <div className="stat"><span className="stat-num ok">{sum.correct}</span><span>Correct</span></div>
            <div className="stat"><span className="stat-num bad">{sum.wrong}</span><span>Wrong{sum.timedOut ? ` (${sum.timedOut} timed out)` : ''}</span></div>
            <div className="stat"><span className="stat-num">{formatSeconds(sum.avgMs)}</span><span>Avg / question</span></div>
          </div>
        </div>

        {run.focus && <BreakCard technique={run.focus} onNextRound={(endAt) => again(endAt)} />}
        {paceNote && <p className="pace-note"><Clock size={15} /> {paceNote}</p>}
        {isReview && sum.correct > 0 && (
          <p className="pace-note"><NotebookPen size={15} /> Correct answers move a step closer to leaving your notebook (3 correct reviews clears one).</p>
        )}

        {guest && (
          <div className="guest-save">
            <p><b>This score isn’t saved.</b> Log in free to keep your Speed Score, streak and mistake notebook.</p>
            <button type="button" className="btn primary" onClick={() => navigate('/login')}>Log in to save</button>
          </div>
        )}

        <div className="results-actions">
          {topic && !run.focus && <button type="button" className="btn primary" onClick={() => again()}><RotateCcw size={15} /> Practise again</button>}
          {/* The notebook comes with the Prelims + Mains plan. */}
          {sum.wrong > 0 && !isReview && practiceAccess === 'full' && <button type="button" className="btn" onClick={() => navigate('/review')}><NotebookPen size={15} /> Mistake Notebook</button>}
          <button type="button" className="btn ghost" onClick={() => navigate(isReview ? '/review' : `/practice/${run.subject}`)}>{isReview ? 'Back to notebook' : 'Change topic'}</button>
          <button type="button" className="btn ghost" onClick={() => navigate('/')}>Home</button>
        </div>
      </section>

      {run.log.length > 0 && (
        <section className="review-list">
          <div className="section-head">
            <h2>Question review</h2>
            <div className="segmented small" role="radiogroup" aria-label="Filter questions">
              <button type="button" role="radio" aria-checked={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All ({run.log.length})</button>
              <button type="button" role="radio" aria-checked={filter === 'wrong'} className={filter === 'wrong' ? 'active' : ''} onClick={() => setFilter('wrong')}>Wrong ({sum.wrong})</button>
            </div>
          </div>
          {shown.length === 0 && <p className="muted">No wrong answers this time. Clean sheet!</p>}
          <ol className="review-items">
            {shown.map(({ entry, n }) => <ReviewItem key={n} entry={entry} number={n} />)}
          </ol>
        </section>
      )}
    </Page>
  )
}

function ReviewItem({ entry, number }) {
  const q = entry.question
  const key = q.correct_option
  return (
    <li className={`card review-item ${entry.correct ? 'is-right' : 'is-wrong'}`}>
      <div className="review-head">
        <span className="review-num">Q{number}</span>
        <span className={`review-badge ${entry.correct ? 'ok' : 'bad'}`}>
          {entry.correct ? <Check size={13} /> : entry.selected === null ? <Hourglass size={13} /> : <X size={13} />}
          {entry.correct ? 'Correct' : entry.selected === null ? 'Timed out' : 'Wrong'}
        </span>
        <span className="muted small">{formatSeconds(entry.timeMs)}</span>
      </div>
      <QuestionBody question={q} compact />
      <p className="review-answers">
        {!entry.correct && entry.selected && (
          <span className="bad">Your answer: ({entry.selected.toUpperCase()}) <RichText text={q[`option_${entry.selected}`]} /></span>
        )}
        <span className="ok">Answer: ({key.toUpperCase()}) <RichText text={q[`option_${key}`]} /></span>
      </p>
      <Solution question={q} defaultOpen={false} />
      <div className="report-row"><ReportQuestion topic={q.topic} questionId={q.id} /></div>
    </li>
  )
}

// After a Pomodoro / 52-17 block: shows the break counting down, then offers
// the next round. If the test was ended early, the block is still running.
function BreakCard({ technique, onNextRound }) {
  const focus = useFocus()
  const left = useCountdown(focus.endAt)
  const t = TECHNIQUES[technique]
  if (focus.technique !== technique || focus.phase === 'idle') return null

  if (focus.phase === 'focus') {
    return (
      <div className="break-card">
        <Ring value={(left ?? 0) / (t.focusMin * 60)} size={56} stroke={5}><Clock size={18} /></Ring>
        <div className="break-text">
          <strong>Focus block still running · {focus.endAt ? formatTime(left ?? 0) : 'paused'}</strong>
          <span>Keep going in this topic until the block ends, or pick another one.</span>
        </div>
        {focus.endAt && <button type="button" className="btn primary" onClick={() => onNextRound(focus.endAt)}><Play size={15} /> Continue</button>}
      </div>
    )
  }
  if (focus.phase === 'break') {
    const total = phaseMinutes(focus) * 60
    return (
      <div className="break-card resting">
        <Ring value={(left ?? 0) / total} size={56} stroke={5} color="var(--green)"><Coffee size={18} /></Ring>
        <div className="break-text">
          <strong>{focus.breakLong ? 'Long break' : 'Break'} · {focus.endAt ? formatTime(left ?? 0) : 'paused'}</strong>
          <span>Round {focus.round} done. Stand up, drink water, look away from the screen.</span>
        </div>
        <button type="button" className="btn ghost small" onClick={() => focusActions.skip()}>Skip break</button>
      </div>
    )
  }
  return (
    <div className="break-card">
      <Ring value={1} size={56} stroke={5} color="var(--green)"><Check size={18} /></Ring>
      <div className="break-text">
        <strong>Break over</strong>
        <span>{t.name}: {focus.round} round{focus.round === 1 ? '' : 's'} done today.</span>
      </div>
      <button type="button" className="btn primary" onClick={() => onNextRound(focusActions.start(technique))}><Play size={15} /> Round {focus.round + 1}</button>
    </div>
  )
}
