import { useEffect, useState } from 'react'
import { BarChart3, ClipboardList, Lock, Play, RotateCcw } from 'lucide-react'
import { Page } from '../components/Layout'
import { EmptyState, SkeletonCards } from '../components/ui'
import { linkProps } from '../lib/router'
import { fetchSeries, formatMarks, formatMinutes } from '../lib/coaching'

// One coaching test series: its published mocks and where the student is on each.
export default function SeriesDetail({ params }) {
  const [series, setSeries] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchSeries(params.series)
      .then((s) => { if (!cancelled) setSeries(s) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [params.series])

  return (
    <Page
      backTo="/mocks"
      title={series?.title || 'Test series'}
      subtitle={series ? [series.coaching?.name, series.exam].filter(Boolean).join(' · ') : undefined}
    >
      {error && <p className="error" role="alert">{error}</p>}
      {!series && !error && <SkeletonCards count={3} height={110} />}
      {series?.description && <p className="series-desc">{series.description}</p>}
      {series && series.mocks.length === 0 && (
        <EmptyState icon={ClipboardList} title="No mocks yet">Your coaching hasn&apos;t published a mock in this series yet. Check back soon.</EmptyState>
      )}
      {series && series.mocks.length > 0 && (
        <ol className="series-mocks">
          {series.mocks.map((m, i) => <MockRow key={m.id} seriesId={series.id} mock={m} number={i + 1} />)}
        </ol>
      )}
    </Page>
  )
}

function MockRow({ seriesId, mock, number }) {
  const questions = mock.sections.reduce((n, s) => n + Number(s.questions || 0), 0)
  const maxMarks = mock.sections.reduce((n, s) => n + Number(s.questions || 0) * Number(s.marks || 0), 0)
  const a = mock.attempt
  const done = a && (a.submitted || a.expired)
  const base = `/series/${seriesId}/${mock.id}`

  return (
    <li className="card series-mock">
      <span className="series-mock-num">{number}</span>
      <div className="series-mock-body">
        <h3>{mock.title}</h3>
        <p className="muted small">
          {questions} questions · {formatMarks(maxMarks)} marks · {formatMinutes(mock.total_sec)}
          {mock.sectional_timing && mock.sections.length > 1 ? ' · sectional timing' : ''}
          {Number(mock.negative_mark) > 0 ? ` · −${formatMarks(mock.negative_mark)} per wrong` : ''}
        </p>
        <p className="series-mock-sections">
          {mock.sections.map((s) => <span key={s.name} className="pill tone-muted">{s.name} · {s.questions}</span>)}
        </p>
      </div>
      <div className="series-mock-action">
        {a?.submitted && a.score !== null && (
          <span className="series-mock-score"><b>{formatMarks(a.score)}</b>/{formatMarks(a.max_score)}</span>
        )}
        {done ? (
          <a className="btn small" {...linkProps(`${base}/result`)}><BarChart3 size={14} /> Result</a>
        ) : mock.locked ? (
          <a className="btn small primary" {...linkProps('/unlock')}><Lock size={14} /> Unlock</a>
        ) : a ? (
          <a className="btn small primary" {...linkProps(base)}><RotateCcw size={14} /> Resume</a>
        ) : (
          <a className="btn small primary" {...linkProps(base)}><Play size={14} /> Start</a>
        )}
      </div>
    </li>
  )
}
