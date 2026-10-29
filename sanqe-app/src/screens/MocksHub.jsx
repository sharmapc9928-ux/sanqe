import { useEffect, useState } from 'react'
import { BarChart3, ChevronRight, ClipboardList, Landmark, PenLine } from 'lucide-react'
import { Page } from '../components/Layout'
import { EmptyState, SkeletonCards } from '../components/ui'
import { linkProps } from '../lib/router'
import { EXAM_LIST, listPrompts } from '../lib/descriptive'
import { LOGOS, MOCK_EXAMS } from '../lib/examLogos'

function ExamLogo({ logoKey }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="exam-logo">
      {failed
        ? <span className="exam-logo-fallback">{logoKey.toUpperCase()}</span>
        : <img src={LOGOS[logoKey].url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </span>
  )
}

export default function MocksHub() {
  const [prompts, setPrompts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listPrompts()
      .then((p) => { if (!cancelled) setPrompts(p) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  const exams = EXAM_LIST
    .map((e) => ({ ...e, count: (prompts || []).filter((p) => p.exam === e.key).length }))
    .filter((e) => e.count > 0)

  return (
    <Page
      title="Mock Tests"
      subtitle="Full-length exam mocks with your score, rank and full solutions, and descriptive mocks with an instant, rubric-based evaluation."
    >
      <section className="series-section">
        <div className="section-head">
          <h2><Landmark size={18} /> Mocks by exam</h2>
        </div>
        <div className="exam-tiles">
          {MOCK_EXAMS.map((e) => (
            <a key={e.slug} className="exam-tile" {...linkProps(`/mocks/exam/${e.slug}`)}>
              <ExamLogo logoKey={e.logo} />
              <span className="exam-tile-name">{e.name}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="series-section">
        <div className="section-head">
          <h2><PenLine size={18} /> Descriptive mocks</h2>
          <a className="btn ghost small" {...linkProps('/mocks/results')}><BarChart3 size={15} /> My results</a>
        </div>
        {!prompts && !error && <SkeletonCards count={2} height={110} />}
        {error && <p className="error" role="alert">{error}</p>}
        {prompts && exams.length === 0 && (
          <EmptyState icon={ClipboardList} title="No descriptive mocks yet">New descriptive mocks are being added.</EmptyState>
        )}
        <div className="grid">
          {exams.map((e) => (
            <a key={e.key} className="card topic-card exam-card" {...linkProps(`/mocks/${e.key}`)}>
              <span className="topic-tile hue-violet"><ClipboardList size={20} /></span>
              <span className="topic-body">
                <span className="topic-name">{e.name} Mains</span>
                <span className="topic-desc">{e.format} · {e.total} marks · {e.durationSec / 60} min</span>
                <span className="topic-meta"><span>{e.count} mock{e.count === 1 ? '' : 's'} available</span></span>
              </span>
              <ChevronRight size={18} className="chev" />
            </a>
          ))}
        </div>
      </section>
    </Page>
  )
}
