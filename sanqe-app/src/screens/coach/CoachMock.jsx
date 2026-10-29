import { useCallback, useEffect, useState } from 'react'
import { Page } from '../../components/Layout'
import { SkeletonCards } from '../../components/ui'
import { MockSettings } from '../../components/coach/MockSettings'
import { MockQuestions } from '../../components/coach/MockQuestions'
import { MockImport } from '../../components/coach/MockImport'
import { MockResults } from '../../components/coach/MockResults'
import { fetchCoachMock, fetchMockQuestions } from '../../lib/coaching'

const TABS = [
  { key: 'settings', label: 'Settings' },
  { key: 'questions', label: 'Questions' },
  { key: 'import', label: 'Import' },
  { key: 'results', label: 'Results' },
]

// Build one mock: settings + sections, questions, CSV import, results.
export default function CoachMock({ params }) {
  const [mock, setMock] = useState(undefined)
  const [questions, setQuestions] = useState([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState(null)

  const load = useCallback(async () => {
    try {
      const m = await fetchCoachMock(params.mock)
      setMock(m)
      if (m) setQuestions(await fetchMockQuestions(m.sections.map((s) => s.id)))
    } catch (e) {
      setError(e.message)
      setMock((prev) => prev ?? null)
    }
  }, [params.mock])
  useEffect(() => { load() }, [load])

  // First visit: a new mock opens on Settings, a built one on Questions or Results.
  useEffect(() => {
    if (!mock || tab) return
    setTab(mock.sections.length === 0 ? 'settings' : mock.status === 'published' ? 'results' : 'questions')
  }, [mock, tab])

  if (mock === undefined) return <Page backTo="/coach" title="Mock"><SkeletonCards count={2} height={120} /></Page>
  if (!mock) {
    return <Page backTo="/coach" title="Mock"><p className="error" role="alert">{error || 'This mock doesn’t exist or isn’t yours.'}</p></Page>
  }

  const coachingId = mock.test_series?.coaching_id
  return (
    <Page
      backTo="/coach"
      title={mock.title}
      subtitle={`${mock.test_series?.exam || mock.test_series?.title || ''} ·${mock.status === 'published' ? 'Published' : 'Draft'} · ${questions.length} questions`}
      className="admin-page coach-page"
    >
      {error && <p className="error" role="alert">{error}</p>}
      <div className="segmented admin-tabs" role="tablist" aria-label="Mock sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'settings' && <MockSettings mock={mock} questions={questions} onChanged={load} />}
      {/* Kept mounted so a half-written question survives switching tabs. */}
      <div hidden={tab !== 'questions'}>
        <MockQuestions key={mock.sections.map((s) => s.id).join(',')} mock={mock} coachingId={coachingId} questions={questions} onChanged={load} />
      </div>
      {tab === 'import' && <MockImport mock={mock} questions={questions} onChanged={load} />}
      {tab === 'results' && <MockResults mock={mock} />}
    </Page>
  )
}
