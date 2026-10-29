import { useEffect, useState } from 'react'
import { BarChart3, ChevronRight, CircleHelp, Clock, FileText, Layers, Lock, Play, RotateCcw, Target } from 'lucide-react'
import { Page } from '../components/Layout'
import { linkProps, navigate } from '../lib/router'
import { fetchOpenMocks, formatMarks } from '../lib/coaching'
import { DESCRIPTIVE, FULL_MOCKS, LOGOS, MOCK_EXAMS, SECTIONAL_MOCKS, SECTIONS, isOneClock, totalsOf } from '../lib/examLogos'

const STAGES = {
  pre: { name: 'Prelims', desc: 'Objective qualifying round', Icon: Target, hue: 'blue' },
  mains: { name: 'Mains', desc: 'Main exam, harder and longer', Icon: Layers, hue: 'violet' },
}

function Choice({ to, Icon, hue, name, desc }) {
  return (
    <a className="card topic-card" {...linkProps(to)}>
      <span className={`topic-tile hue-${hue}`}><Icon size={20} /></span>
      <span className="topic-body">
        <span className="topic-name">{name}</span>
        <span className="topic-desc">{desc}</span>
      </span>
      <ChevronRight size={18} className="chev" />
    </a>
  )
}

// Mocks by exam: exam -> Prelims / Mains -> tabs of Full Test and each section.
export default function MockExamFlow({ params }) {
  const exam = MOCK_EXAMS.find((e) => e.slug === params.slug)
  const stage = STAGES[params.stage]
    const invalid = !exam || (params.stage && !stage)

  useEffect(() => {
    if (invalid) navigate('/mocks', { replace: true })
    else if (params.type) navigate(`/mocks/exam/${exam.slug}/${params.stage}`, { replace: true })
  }, [invalid, params.type, params.stage, exam])
  if (invalid || params.type) return null

  const base = `/mocks/exam/${exam.slug}`

  if (!params.stage) {
    return (
      <Page backTo="/mocks" title={exam.name} subtitle={LOGOS[exam.logo].name}>
        <div className="grid">
          {Object.entries(STAGES).map(([key, s]) => (
            <Choice key={key} to={`${base}/${key}`} Icon={s.Icon} hue={s.hue} name={s.name} desc={s.desc} />
          ))}
        </div>
      </Page>
    )
  }

  const paper = SECTIONS[exam.slug]?.[params.stage] || []
  const totals = totalsOf(paper)
  const descriptive = params.stage === 'mains' ? DESCRIPTIVE[exam.slug] : null
  const tabs = [
    { name: 'Full Test', ...totals, full: true, count: FULL_MOCKS },
    ...paper.map((sec) => ({ ...sec, count: SECTIONAL_MOCKS })),
  ]

  return (
    <Page backTo={base} title={`${exam.name} ${stage.name}`} subtitle="Full tests and sectional tests">
      {paper.length > 0 && (
        <p className="muted small">
          {totals.q} questions · {totals.marks} marks ·{' '}
          {isOneClock(exam.slug, params.stage) ? `${totals.min} minutes on one clock for the whole paper` : 'each section is timed separately'}
          {' '}· ¼ mark off for every wrong answer.
          {descriptive && ` A separate ${descriptive.name} follows: ${descriptive.q} questions, ${descriptive.marks} marks, ${descriptive.min} minutes.`}
        </p>
      )}
      <MockRows exam={exam} stage={stage} stageKey={params.stage} tabs={tabs} />
    </Page>
  )
}

// Fedge's live full-length mocks (open test series) belong to the exam whose
// name they carry, and to Mains only when the title says so.
const isForStage = (m, exam, stageKey) =>
  (m.exam || '').trim().toLowerCase() === exam.name.toLowerCase() && (/\bmains\b/i.test(m.title) ? 'mains' : 'pre') === stageKey

function OpenMockRow({ mock }) {
  const questions = mock.sections.reduce((n, s) => n + Number(s.questions || 0), 0)
  const marks = mock.sections.reduce((n, s) => n + Number(s.questions || 0) * Number(s.marks || 0), 0)
  const a = mock.attempt
  const done = a && (a.submitted || a.expired)
  const base = `/series/${mock.series_id}/${mock.id}`
  return (
    <div className="card mock-row">
      <div className="mock-row-main">
        <b className="mock-row-title">{mock.title}{mock.free_sample && <span className="mock-row-tag">Free</span>}</b>
        <span className="mock-row-meta">
          <span><CircleHelp size={14} /> {questions} Questions</span>
          <span><FileText size={14} /> {formatMarks(marks)} Marks</span>
          <span><Clock size={14} /> {Math.round(Number(mock.total_sec || 0) / 60)} Mins</span>
          {a?.submitted && a.score != null && <span>Score {formatMarks(a.score)}/{formatMarks(a.max_score)}</span>}
        </span>
      </div>
      {done ? (
        <a className="btn" {...linkProps(`${base}/result`)}><BarChart3 size={14} /> Result</a>
      ) : mock.locked ? (
        <a className="btn primary" {...linkProps('/unlock')}><Lock size={14} /> Unlock</a>
      ) : a ? (
        <a className="btn primary" {...linkProps(base)}><RotateCcw size={14} /> Resume</a>
      ) : (
        <a className="btn primary" {...linkProps(base)}><Play size={14} /> Start</a>
      )}
    </div>
  )
}

// Tabs (one per section for Sectional) above a list of test rows: the live
// mocks first on the Full Test tab, then the locked ones still to come.
function MockRows({ exam, stage, stageKey, tabs }) {
  const [active, setActive] = useState(0)
  const [live, setLive] = useState([])
  useEffect(() => {
    let cancelled = false
    fetchOpenMocks()
      .then((all) => { if (!cancelled) setLive(all.filter((m) => isForStage(m, exam, stageKey))) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [exam, stageKey])
  const tab = tabs[Math.min(active, tabs.length - 1)]
  if (!tab) return <p className="muted">No sections listed yet.</p>
  return (
    <>
      {tabs.length > 1 && (
        <div className="mock-tabs" role="tablist">
          {tabs.map((t, i) => (
            <button
              key={t.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`mock-tab${i === active ? ' on' : ''}`}
              onClick={() => setActive(i)}
            >
              {t.name} <span className="mock-tab-count">({t.count})</span>
            </button>
          ))}
        </div>
      )}
      {tab.full && live.some((m) => m.locked) && (
        <a className="card plan-note mock-unlock-note" {...linkProps('/unlock')}>
          <Lock size={18} />
          <p><b>{live.some((m) => !m.locked) ? 'Unlock the rest of the Fedge mocks.' : 'Unlock Fedge mocks.'}</b> Get FEDGE All-Access, or add your coaching with its referral code.</p>
          <ChevronRight size={18} className="chev" />
        </a>
      )}
      <div className="mock-rows">
        {tab.full && live.map((m) => <OpenMockRow key={m.id} mock={m} />)}
        {Array.from({ length: Math.max(0, tab.count - (tab.full ? live.length : 0)) }, (_, i) => (
          <div key={i} className="card mock-row">
            <div className="mock-row-main">
              <b className="mock-row-title">
                {tab.full ? `${exam.name} ${stage.name} Full Test ${live.length + i + 1}` : `${exam.name} ${tab.name} Sectional Test ${i + 1}`}
              </b>
              <span className="mock-row-meta">
                <span><CircleHelp size={14} /> {tab.q} Questions</span>
                <span><FileText size={14} /> {tab.marks} Marks</span>
                <span><Clock size={14} /> {tab.min} Mins</span>
              </span>
            </div>
            <button type="button" className="btn ghost" disabled><Lock size={14} /> Coming soon</button>
          </div>
        ))}
      </div>
    </>
  )
}
