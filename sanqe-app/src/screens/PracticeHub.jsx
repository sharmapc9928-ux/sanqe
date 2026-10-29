import { useEffect, useState } from 'react'
import { ChevronRight, CircleDot, ClipboardList, Lock, NotebookPen, Tag, Timer } from 'lucide-react'
import { Page } from '../components/Layout'
import { SubjectCard } from '../components/Syllabus'
import { useApp } from '../lib/appContext'
import { FREE_TOPICS_NOTE, formatPassDate, formatRupees, isPaid, usePracticePlans } from '../lib/practice'
import { linkProps } from '../lib/router'
import { MAINS_SUBJECTS, SUBJECTS } from '../lib/syllabus'
import { readStore, writeStore } from '../lib/storage'
import { TECHNIQUES, useFocus } from '../lib/focus'
import { useCountdown } from '../lib/useCountdown'
import { formatTime } from '../lib/format'

// Prelims and Mains each get their own set of subjects. The tab is remembered
// so coming back from a subject page lands on the same one.
const STAGES = [
  {
    key: 'prelims',
    label: 'Prelims',
    subjects: SUBJECTS,
    subtitle: 'Everything in the SBI and IBPS PO, Clerk and RRB Prelims syllabus, topic by topic.',
  },
  {
    key: 'mains',
    label: 'Mains',
    subjects: MAINS_SUBJECTS,
    subtitle: 'Mains-level practice for SBI and IBPS PO, Clerk and RRB: harder sets, topic by topic.',
  },
]
const STAGE_KEY = 'sanqe-practice-stage'

export default function PracticeHub() {
  const { stats, refreshStats, counts, guest, hasCourse, practiceAccess } = useApp()
  useEffect(() => { refreshStats() }, [refreshStats])
  const due = stats?.review_due || 0
  const total = stats?.review_total || 0
  const [stageKey, setStageKey] = useState(() => {
    const saved = readStore(STAGE_KEY)
    return STAGES.some((s) => s.key === saved) ? saved : 'prelims'
  })
  const stage = STAGES.find((s) => s.key === stageKey)
  const pickStage = (key) => { setStageKey(key); writeStore(STAGE_KEY, key) }

  return (
    <Page title="Practice" subtitle={stage.subtitle}>
      <PlanBanner />
      <div className="segmented" role="tablist" aria-label="Exam stage">
        {STAGES.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={stageKey === s.key} className={stageKey === s.key ? 'active' : ''} onClick={() => pickStage(s.key)}>{s.label}</button>
        ))}
      </div>

      <div className="subject-grid">
        {stage.subjects.map((s) => (
          <SubjectCard key={s.key} subject={s} to={`/practice/${s.key}`} counts={counts} stats={stats} />
        ))}
      </div>

      {/* The focus timer comes with any plan, the notebook with Prelims + Mains,
          the mocks with a course; the Circle Game needs an account. */}
      {!guest && (
        <>
          <h2 className="section-title">Study tools</h2>
          <ul className="card topic-list">
            {isPaid(practiceAccess) && <ToolRow to="/focus" hue="amber" Icon={Timer} title="Focus timer" sub={<FocusSub />} />}
            {practiceAccess === 'full' && (
              <ToolRow
                to="/review"
                hue="rose"
                Icon={NotebookPen}
                title="Mistake Notebook"
                sub={total > 0 ? `${total} saved · comes back after 1, 3 and 7 days` : 'Every wrong answer is saved here for spaced review'}
                badge={due > 0 ? `${due} due` : null}
              />
            )}
            <ToolRow to="/speed" hue="teal" Icon={CircleDot} title="Circle Game" sub="Add 10 numbers before the clock runs out" />
            {hasCourse && <ToolRow to="/mocks" hue="violet" Icon={ClipboardList} title="Descriptive mocks" sub="Essay, letter & comprehension with AI marking" />}
          </ul>
        </>
      )}
    </Page>
  )
}

// Where the student stands: free topics only, a Prelims plan to upgrade, or
// nothing when they have everything.
function PlanBanner() {
  const { practiceAccess, practicePass } = useApp()
  const { plans } = usePracticePlans()
  if (practiceAccess !== 'none' && practiceAccess !== 'prelims') return null

  if (practiceAccess === 'prelims') {
    return (
      <div className="card plan-banner">
        <Tag size={18} />
        <p><b>Prelims plan</b> till {formatPassDate(practicePass.until)}. Mains topics and the Mistake Notebook come with Prelims + Mains.</p>
        <a className="btn small" {...linkProps('/plans')}>Upgrade</a>
      </div>
    )
  }
  const from = plans.length ? Math.min(...plans.map((p) => p.amount_inr)) : null
  return (
    <div className="card plan-banner">
      <Lock size={18} />
      <p>
        <b>{FREE_TOPICS_NOTE} are free.</b> Every other topic needs a plan{from ? `, from ${formatRupees(from)}` : ''}.
      </p>
      <a className="btn small primary" {...linkProps('/plans')}>See plans</a>
    </div>
  )
}

function FocusSub() {
  const focus = useFocus()
  const left = useCountdown(focus.endAt)
  if (focus.phase === 'focus' || focus.phase === 'break') {
    const label = focus.phase === 'focus' ? 'Focus' : 'Break'
    return <>{TECHNIQUES[focus.technique].name} running · {label} {focus.endAt ? formatTime(left ?? 0) : 'paused'}</>
  }
  return <>Pomodoro (25 / 5) or 52 / 17 study blocks</>
}

function ToolRow({ to, hue, Icon, title, sub, badge }) {
  return (
    <li>
      <a className="topic-row" {...linkProps(to)}>
        <span className={`topic-icon hue-${hue}`}><Icon size={18} /></span>
        <span className="topic-main">
          <span className="topic-title">{title}</span>
          <span className="topic-sub">{sub}</span>
        </span>
        {badge && <span className="pill tone-low">{badge}</span>}
        <ChevronRight size={16} className="chev" aria-hidden="true" />
      </a>
    </li>
  )
}
