import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { SkeletonCards } from '../ui'
import { toCsv } from '../../lib/csv'
import { formatDateTime, formatTime } from '../../lib/format'
import { downloadCsv, fetchMockResultsForCoach, formatMarks } from '../../lib/coaching'

// Every submitted attempt on a mock, ranked, with section-wise scores.
export function MockResults({ mock }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchMockResultsForCoach(mock.id).then(setRows).catch((e) => { setRows([]); setError(e.message) })
  }, [mock.id])

  const sections = mock.sections.map((s) => s.name)
  const sectionScore = (r, name) => (r.section_scores || []).find((s) => s.name === name)

  const exportCsv = () => {
    const head = ['rank', 'name', 'email', 'score', 'max_score', 'correct', 'wrong', 'unattempted', ...sections, 'time_taken', 'submitted_at']
    const body = rows.map((r) => [
      r.rank, r.name, r.email, formatMarks(r.score), formatMarks(r.max_score), r.correct, r.wrong, r.unattempted,
      ...sections.map((n) => formatMarks(sectionScore(r, n)?.score)), formatTime(r.time_taken_sec), formatDateTime(r.submitted_at),
    ])
    downloadCsv(`${mock.title.replace(/[^\w-]+/g, '_')}-results.csv`, toCsv([head, ...body]))
  }

  if (error) return <p className="error" role="alert">{error}</p>
  if (rows === null) return <SkeletonCards count={1} height={160} />
  if (rows.length === 0) {
    return <p className="muted">{mock.status === 'published' ? 'No one has submitted this mock yet.' : 'Publish the mock to start getting results.'}</p>
  }

  const avg = rows.reduce((n, r) => n + Number(r.score), 0) / rows.length

  return (
    <>
      <div className="admin-list-head">
        <p className="muted small">
          {rows.length} submitted · topper {formatMarks(rows[0].score)} · average {formatMarks(avg)} out of {formatMarks(rows[0].max_score)}
        </p>
        <button type="button" className="btn small" onClick={exportCsv}><Download size={14} /> CSV</button>
      </div>
      <div className="card coach-table-wrap">
        <table className="coach-table">
          <thead>
            <tr>
              <th>#</th><th>Student</th><th>Score</th>
              {sections.map((n) => <th key={n}>{n}</th>)}
              <th>✓ / ✗</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td>{r.rank}</td>
                <td><b>{r.name}</b><br /><span className="muted small">{r.email}</span></td>
                <td><b>{formatMarks(r.score)}</b></td>
                {sections.map((n) => <td key={n}>{formatMarks(sectionScore(r, n)?.score)}</td>)}
                <td><span className="ok">{r.correct}</span> / <span className="bad">{r.wrong}</span></td>
                <td>{formatTime(r.time_taken_sec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
