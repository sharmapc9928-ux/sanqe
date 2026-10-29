import { useEffect, useState } from 'react'
import { BarChart3, CircleCheck, PenLine } from 'lucide-react'
import { Page } from '../components/Layout'
import { SkeletonCards } from '../components/ui'
import { useApp } from '../lib/appContext'
import { linkProps, navigate } from '../lib/router'
import { readStore, userKey } from '../lib/storage'
import { EXAMS, listMyAttempts, listPrompts } from '../lib/descriptive'

export default function MockList({ params }) {
  const { user } = useApp()
  const exam = EXAMS[params.exam]
  const [prompts, setPrompts] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!exam) navigate('/mocks', { replace: true })
  }, [exam])

  useEffect(() => {
    if (!exam) return undefined
    let cancelled = false
    listPrompts()
      .then((p) => { if (!cancelled) setPrompts(p.filter((x) => x.exam === exam.key)) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    // Attempt history is optional decoration; ignore failures.
    listMyAttempts(user.id)
      .then((a) => { if (!cancelled) setAttempts(a.filter((x) => x.exam === exam.key)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [exam, user.id])

  if (!exam) return null

  return (
    <Page
      backTo="/mocks"
      title={`${exam.name} Mains — Descriptive`}
      subtitle={`${exam.format} · ${exam.total} marks · ${exam.durationSec / 60} minutes on one clock`}
      actions={<a className="btn ghost small" {...linkProps('/mocks/results')}><BarChart3 size={15} /> My results</a>}
    >
      {!prompts && !error && <SkeletonCards count={4} height={92} />}
      {error && <p className="error" role="alert">{error}</p>}
      {prompts && (
        <div className="grid duration-grid">
          {prompts.map((p) => {
            const mine = attempts.filter((a) => a.mock_number === p.mock_number)
            const best = mine.reduce((m, a) => Math.max(m, Number(a.evaluation?.total_score ?? -1)), -1)
            const inProgress = !!readStore(userKey(user.id, `desc:${exam.key}:${p.mock_number}`), null)
            return (
              <a key={p.id} className="card duration-card mock-card" {...linkProps(`/mocks/${exam.key}/${p.mock_number}`)}>
                <span className="duration-label">Mock {p.mock_number}</span>
                <span className="duration-tag mock-topic">{exam.key === 'sbi_po' ? p.letter_topic : p.essay_topic}</span>
                {inProgress && <span className="pill tone-mid"><PenLine size={12} /> In progress</span>}
                {!inProgress && best >= 0 && <span className="pill tone-good"><CircleCheck size={12} /> Best {Math.round(best * 100) / 100}/{exam.total}</span>}
              </a>
            )
          })}
        </div>
      )}
      {prompts && <p className="muted small more-note">New mocks are added regularly.</p>}
    </Page>
  )
}
