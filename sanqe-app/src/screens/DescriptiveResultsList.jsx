import { useEffect, useState } from 'react'
import { ChevronDown, ClipboardList } from 'lucide-react'
import { Page } from '../components/Layout'
import DescriptiveResult from '../components/DescriptiveResult'
import { EmptyState, ScoreLine, SkeletonCards } from '../components/ui'
import { useApp } from '../lib/appContext'
import { linkProps } from '../lib/router'
import { formatDateTime, formatShortDate } from '../lib/format'
import { EXAMS, EXAM_LIST, evaluateAttempt, listMyAttempts } from '../lib/descriptive'

export default function DescriptiveResultsList() {
  const { user } = useApp()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const [retrying, setRetrying] = useState(null)
  const [retryError, setRetryError] = useState({})

  useEffect(() => {
    let cancelled = false
    listMyAttempts(user.id)
      .then((r) => { if (!cancelled) setRows(r) })
      .catch((e) => {
        if (cancelled) return
        // Before the per-user migration the table has no user_id column yet.
        setError(e.missingSchema ? 'Your results history is being set up and will appear here soon.' : e.message)
      })
    return () => { cancelled = true }
  }, [user.id])

  const retry = async (row) => {
    setRetrying(row.id)
    setRetryError((m) => ({ ...m, [row.id]: '' }))
    try {
      const evaluation = await evaluateAttempt(row.id)
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, evaluation } : r)))
    } catch (e) {
      setRetryError((m) => ({ ...m, [row.id]: e.message }))
    } finally {
      setRetrying(null)
    }
  }

  const examsWithRows = rows ? EXAM_LIST.filter((e) => rows.some((r) => r.exam === e.key)) : []

  return (
    <Page backTo="/mocks" title="My descriptive results" subtitle="Every attempt you've submitted, with its full evaluation.">
      {!rows && !error && <SkeletonCards count={3} height={64} />}
      {error && <p className="info">{error}</p>}

      {rows && rows.length === 0 && (
        <EmptyState icon={ClipboardList} title="No attempts yet" action={<a className="btn primary" {...linkProps('/mocks')}>Take a mock test</a>}>
          Submit a descriptive mock and its evaluation shows up here.
        </EmptyState>
      )}

      {examsWithRows.map((e) => {
        const scored = rows
          .filter((r) => r.exam === e.key && r.evaluation)
          .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
        if (scored.length < 2) return null
        return (
          <section key={e.key} className="card dash-section">
            <div className="section-head">
              <h2>{e.name} score trend</h2>
              <span className="muted small">out of {e.total}</span>
            </div>
            <ScoreLine
              max={e.total}
              label={`${e.name} scores over time`}
              points={scored.map((r) => ({ value: Number(r.evaluation.total_score) || 0, label: `Mock ${r.mock_number}, ${formatShortDate(r.submitted_at)}` }))}
            />
          </section>
        )
      })}

      {rows && rows.length > 0 && (
        <ul className="dres-list">
          {rows.map((row) => {
            const exam = EXAMS[row.exam] || EXAMS.ibps_po
            const isOpen = open === row.id
            return (
              <li className="card dres-row" key={row.id}>
                <button type="button" className="dres-row-header" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.id)}>
                  <span className="dres-row-name">{exam.name} · Mock {row.mock_number}</span>
                  <span className="dres-row-score">
                    {row.evaluation ? `${Math.round(Number(row.evaluation.total_score) * 100) / 100}/${exam.total}` : 'Not evaluated'}
                  </span>
                  <span className="dres-row-date">{formatDateTime(row.submitted_at)}</span>
                  <ChevronDown size={16} className={`dres-row-caret${isOpen ? ' open' : ''}`} />
                </button>
                {isOpen && (
                  <div className="dres-row-body">
                    <DescriptiveResult
                      exam={row.exam}
                      submission={row}
                      evaluation={row.evaluation}
                      evalLoading={retrying === row.id}
                      evalError={retryError[row.id]}
                      onRetry={!row.evaluation ? () => retry(row) : undefined}
                    />
                    {!row.evaluation && !retryError[row.id] && retrying !== row.id && (
                      <button type="button" className="btn primary small evaluate-btn" onClick={() => retry(row)}>Evaluate now</button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Page>
  )
}
