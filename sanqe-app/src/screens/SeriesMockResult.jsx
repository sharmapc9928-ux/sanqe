import { useEffect, useState } from 'react'
import { BarChart3, Trophy, Users } from 'lucide-react'
import { navigate } from '../lib/router'
import { Page } from '../components/Layout'
import { Donut, SkeletonCards } from '../components/ui'
import { formatTime } from '../lib/format'
import { fetchMockResult, formatMarks } from '../lib/coaching'

// Score and rank for one coaching mock; the answer key lives on the Analyse screen.
export default function SeriesMockResult({ params }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const back = `/series/${params.series}`

  useEffect(() => {
    let cancelled = false
    fetchMockResult(params.mock)
      .then((r) => { if (!cancelled) setResult(r) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [params.mock])

  if (error || !result) {
    return (
      <Page backTo={back} title="Result">
        {error ? <p className="error" role="alert">{error}</p> : <SkeletonCards count={2} height={160} />}
      </Page>
    )
  }

  const attempted = result.correct + result.wrong
  const accuracy = attempted ? Math.round((result.correct / attempted) * 100) : 0

  return (
    <Page backTo={back} className="results-page">
      <section className="card results-card">
        <p className="results-kicker">Mock result</p>
        <h1>{result.mock.title}</h1>

        <div className="results-summary">
          <Donut
            label={`${result.correct} correct, ${result.wrong} wrong, ${result.unattempted} not attempted`}
            segments={[
              { key: 'c', value: result.correct, color: 'var(--green)' },
              { key: 'w', value: result.wrong, color: 'var(--red)' },
              { key: 'u', value: result.unattempted, color: 'var(--track)' },
            ]}
            center={<><span className="donut-num">{formatMarks(result.score)}</span><span className="donut-cap">of {formatMarks(result.max_score)}</span></>}
          />
          <div className="results-grid">
            <div className="stat"><span className="stat-num"><Trophy size={16} /> {result.rank}</span><span>Rank of {result.takers}</span></div>
            <div className="stat"><span className="stat-num">{formatMarks(result.percentile)}</span><span>Percentile</span></div>
            <div className="stat"><span className="stat-num">{accuracy}%</span><span>Accuracy</span></div>
            <div className="stat"><span className="stat-num">{formatTime(result.time_taken_sec)}</span><span>Time taken</span></div>
          </div>
        </div>

        <p className="pace-note">
          <Users size={15} /> Topper: <b>{formatMarks(result.topper_score)}</b> · Average: <b>{formatMarks(result.average_score)}</b>
          {result.takers === 1 ? ' — you’re the first to finish; rank updates as others take it.' : ''}
        </p>

        <button type="button" className="btn primary full" onClick={() => navigate(`${back}/${params.mock}/analysis`)}>
          <BarChart3 size={16} /> Analyse
        </button>

        <div className="cm-result-table-wrap">
          <table className="cm-result-table">
            <thead><tr><th>Section</th><th>Score</th><th>Correct</th><th>Wrong</th><th>Skipped</th></tr></thead>
            <tbody>
              {(result.section_scores || []).map((s) => (
                <tr key={s.section_id}>
                  <td>{s.name}</td>
                  <td><b>{formatMarks(s.score)}</b>/{formatMarks(s.max_score)}</td>
                  <td className="ok">{s.correct}</td>
                  <td className="bad">{s.wrong}</td>
                  <td>{s.total - s.correct - s.wrong}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  )
}
