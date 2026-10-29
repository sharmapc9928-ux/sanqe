import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, LayoutGrid, X } from 'lucide-react'
import { PassageText, QuestionImage, optionKeys } from '../components/Question'
import { RichText } from '../components/RichText'
import { Solution } from '../components/Solution'
import { SkeletonCards } from '../components/ui'
import { Page } from '../components/Layout'
import { navigate } from '../lib/router'
import { fetchMockResult, formatMarks } from '../lib/coaching'

const stateOf = (q) => (!q.selected ? 'skipped' : q.selected === q.correct_option ? 'right' : 'wrong')
const STATE_LABEL = { right: 'Correct', wrong: 'Wrong', skipped: 'Not attempted' }

// Read-only walkthrough of a submitted mock: exam-style layout, correct answer
// marked on every question, the candidate's own pick, and the solution open.
export default function SeriesMockAnalysis({ params }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [cur, setCur] = useState({ si: 0, qi: 0 })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const resultPath = `/series/${params.series}/${params.mock}/result`

  useEffect(() => {
    let cancelled = false
    fetchMockResult(params.mock)
      .then((r) => { if (!cancelled) setResult(r) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [params.mock])

  if (error || !result) {
    return (
      <Page backTo={`/series/${params.series}`} title="Analysis">
        {error ? <p className="error" role="alert">{error}</p> : <SkeletonCards count={2} height={160} />}
      </Page>
    )
  }

  const sections = result.sections
  const section = sections[cur.si]
  const q = section.questions[cur.qi]
  const state = stateOf(q)
  const hasPassage = !!(q.passage || q.image_url)
  const sectionScore = (result.section_scores || []).find((s) => s.section_id === section.id)
  const go = (si, qi) => { setCur({ si, qi }); setPaletteOpen(false) }
  const hasPrev = cur.qi > 0 || cur.si > 0
  const hasNext = cur.qi < section.questions.length - 1 || cur.si < sections.length - 1
  const prev = () => {
    if (cur.qi > 0) go(cur.si, cur.qi - 1)
    else if (cur.si > 0) go(cur.si - 1, sections[cur.si - 1].questions.length - 1)
  }
  const next = () => {
    if (cur.qi < section.questions.length - 1) go(cur.si, cur.qi + 1)
    else if (cur.si < sections.length - 1) go(cur.si + 1, 0)
  }
  const counts = { right: 0, wrong: 0, skipped: 0 }
  section.questions.forEach((x) => { counts[stateOf(x)] += 1 })

  const palette = (
    <>
      <div className="ex-cand">
        <span className="ex-cand-name">
          Score: {formatMarks(sectionScore?.score ?? result.score)}/{formatMarks(sectionScore?.max_score ?? result.max_score)}
        </span>
        <button type="button" className="ex-palette-close icon-btn" aria-label="Close palette" onClick={() => setPaletteOpen(false)}><X size={16} /></button>
      </div>
      <div className="ex-legend">
        {['right', 'wrong', 'skipped'].map((k) => (
          <div key={k} className="ex-lg">
            <span className={`cm-pbtn an-${k}`}>{counts[k]}</span>
            <span>{STATE_LABEL[k]}</span>
          </div>
        ))}
      </div>
      <div className="ex-viewing">You are viewing <b>{section.name}</b> section</div>
      <div className="ex-pal-title">Question Palette :</div>
      <div className="ex-pgrid">
        {section.questions.map((qq, i) => (
          <button
            key={qq.id}
            type="button"
            className={`cm-pbtn an-${stateOf(qq)}${i === cur.qi ? ' current' : ''}`}
            onClick={() => go(cur.si, i)}
            aria-label={`Question ${i + 1}: ${STATE_LABEL[stateOf(qq)]}`}
            aria-current={i === cur.qi ? 'true' : undefined}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="ex-sub-wrap">
        <button type="button" className="ex-btn primary" onClick={() => navigate(resultPath)}>Back to result</button>
      </div>
    </>
  )

  return (
    <div className="ex-test">
      <div className="ex-hdr">
        <h1 className="ex-title">{result.mock.title} · Analysis</h1>
        <button type="button" className="ex-link" onClick={() => navigate(resultPath)}>Back to result</button>
      </div>

      <div className="ex-secrow">
        <span className="ex-seclabel">Sections</span>
        <div className="ex-tabs" role="tablist" aria-label="Sections">
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === cur.si}
              className={`ex-tab${i === cur.si ? ' active' : ''}`}
              onClick={() => go(i, 0)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <button type="button" className="ex-palette-toggle" onClick={() => setPaletteOpen(true)} aria-label="Open question palette">
          <LayoutGrid size={16} /> {cur.qi + 1}/{section.questions.length}
        </button>
      </div>

      <div className="ex-main">
        <div className="ex-left">
          <div className="ex-qhead">
            <span className="ex-qt">Question Type: MCQ</span>
            <span className={`an-badge an-${state}`}>
              {state === 'right' ? <Check size={13} /> : state === 'wrong' ? <X size={13} /> : null} {STATE_LABEL[state]}
            </span>
          </div>
          <div className="ex-qno">Question No. {cur.qi + 1}</div>
          <div className="ex-qbody">
            {hasPassage && (
              <div className="ex-passage" key={`p-${q.passage || ''}-${q.image_url ? 1 : 0}`}>
                {q.passage && <PassageText text={q.passage} />}
                {q.image_url && <QuestionImage src={q.image_url} />}
              </div>
            )}
            <div className="ex-qright" key={q.id}>
              <div className="ex-qtext"><RichText text={q.question} /></div>
              <div className="ex-opts" aria-label="Options">
                {optionKeys(q).map((k, i) => {
                  const isCorrect = k === q.correct_option
                  const isPicked = k === q.selected
                  const cls = isCorrect ? ' an-correct' : isPicked ? ' an-wrong' : ''
                  return (
                    <div key={k} className={`ex-opt${cls}`}>
                      <span className="ex-rad" aria-hidden="true">{isPicked && <span className="an-dot" />}</span>
                      <span className="ex-no">{i + 1}.</span>
                      <span className="ex-opt-text"><RichText text={q[`option_${k}`]} /></span>
                      {(isCorrect || isPicked) && (
                        <span className="an-tag">
                          {isCorrect ? <Check size={13} /> : <X size={13} />}
                          {isCorrect && isPicked ? 'Your answer · Correct' : isCorrect ? 'Correct answer' : 'Your answer'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <Solution question={q} defaultOpen />
            </div>
          </div>
          <div className="ex-bar">
            <button type="button" className="ex-btn" onClick={prev} disabled={!hasPrev}><ChevronLeft size={14} /> Previous</button>
            <button type="button" className="ex-btn primary" onClick={next} disabled={!hasNext}>Next <ChevronRight size={14} /></button>
          </div>
        </div>

        <button type="button" className="ex-collapse" onClick={() => setCollapsed((c) => !c)} title="Show / hide question palette" aria-label="Show or hide question palette">
          {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
        <aside className={`ex-right${paletteOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`} aria-label="Question palette">{palette}</aside>
        {paletteOpen && <div className="cm-palette-backdrop" onClick={() => setPaletteOpen(false)} />}
      </div>
    </div>
  )
}
