import { useState } from 'react'
import { EXAMS } from '../lib/descriptive'

// Theme-independent "evaluation report" card — shown right after submitting
// (inside the exam-style shell) and later from My Results. An official-
// looking score report shouldn't shift with dark/cream/light mode.

function fmtScore(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return Math.round(Number(n) * 100) / 100
}

// Wrap each flagged phrase (first occurrence) in <mark> with its issue as a tooltip.
export function highlightFlags(text, flags) {
  if (!text) return text
  const ranges = []
  flags.forEach((f, i) => {
    const needle = (f?.text || '').trim()
    if (needle.length < 2) return
    let at = text.indexOf(needle)
    if (at === -1) at = text.toLowerCase().indexOf(needle.toLowerCase())
    if (at === -1) return
    const end = at + needle.length
    if (ranges.some((r) => at < r.end && end > r.start)) return
    ranges.push({ start: at, end, flag: f, n: i + 1 })
  })
  if (ranges.length === 0) return text
  ranges.sort((a, b) => a.start - b.start)
  const out = []
  let cursor = 0
  ranges.forEach((r) => {
    if (r.start > cursor) out.push(text.slice(cursor, r.start))
    out.push(
      <mark key={r.start} className="dres-mark" title={`${r.flag.issue}${r.flag.suggestion ? ` → ${r.flag.suggestion}` : ''}`}>
        {text.slice(r.start, r.end)}<sup>{r.n}</sup>
      </mark>,
    )
    cursor = r.end
  })
  if (cursor < text.length) out.push(text.slice(cursor))
  return out
}

const PART_FIELDS = {
  essay: { score: 'essay_score', feedback: 'essay_feedback', answer: 'essay_answer', improved: 'improved_essay' },
  letter: { score: 'letter_score', feedback: 'letter_feedback', answer: 'letter_answer', improved: 'improved_letter' },
  comprehension: { score: 'comprehension_score', feedback: 'comprehension_feedback' },
}

export default function DescriptiveResult({ exam = 'ibps_po', submission, evaluation, evalLoading, evalError, onRetry }) {
  const cfg = EXAMS[exam] || EXAMS.ibps_po
  const compAnswers = Array.isArray(submission?.comprehension_answers) ? submission.comprehension_answers : []
  const grammarFlags = Array.isArray(evaluation?.grammar_flags) ? evaluation.grammar_flags : []
  const tips = Array.isArray(evaluation?.improvement_tips) ? evaluation.improvement_tips : []
  const inSafeZone = evaluation ? Number(evaluation.total_score) >= cfg.safeZone : false
  const [showImproved, setShowImproved] = useState(null)

  const writtenParts = cfg.parts.filter((p) => p.key !== 'comprehension')

  return (
    <div className="dres-card">
      {evalLoading && (
        <div className="dres-loading" role="status">
          <div className="dres-spinner" aria-hidden="true" />
          <p>Saving your answers and evaluating them — this takes 10–30 seconds…</p>
        </div>
      )}

      {!evalLoading && evalError && (
        <div className="dres-section">
          <p className="dres-error">Evaluation failed: {evalError}</p>
          {onRetry && <button type="button" className="exam-native-btn start" onClick={onRetry}>Retry evaluation</button>}
        </div>
      )}

      {!evalLoading && !evalError && !evaluation && (
        <p className="dres-note">No evaluation yet for this attempt — your answers are below.</p>
      )}

      {!evalLoading && evaluation && (
        <>
          <div className="dres-total">
            <span className="dres-total-num">{fmtScore(evaluation.total_score)}</span>
            <span className="dres-total-max">/ {cfg.total}</span>
          </div>

          <div className={`dres-benchmark ${inSafeZone ? 'safe' : 'risk'}`}>
            {inSafeZone ? '✓' : '△'} Estimated safe zone: {cfg.safeZone}+/{cfg.total} — our own benchmark, not an official cutoff.
          </div>

          <div className="dres-breakdown">
            {cfg.parts.map((p) => (
              <div className="dres-stat" key={p.key}>
                <span className="dres-stat-label">{p.label} (estimated split, max {p.max})</span>
                <span className="dres-stat-num">{fmtScore(evaluation[PART_FIELDS[p.key].score])}</span>
                <p className="dres-stat-feedback">{evaluation[PART_FIELDS[p.key].feedback]}</p>
              </div>
            ))}
          </div>

          {evaluation.copied_content_warning && (
            <div className="dres-warning">Parts of your comprehension answers look copied from the passage rather than written in your own words, so those marks were reduced.</div>
          )}

          {grammarFlags.length > 0 && (
            <div className="dres-section">
              <h4>Grammar &amp; language</h4>
              <ol className="dres-flags">
                {grammarFlags.map((f, i) => (
                  <li key={i} className="dres-flag">
                    <span className="dres-flag-text">&ldquo;{f.text}&rdquo;</span>
                    <span className="dres-flag-issue">{f.issue}</span>
                    {f.suggestion && <span className="dres-flag-suggestion">→ {f.suggestion}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {tips.length > 0 && (
            <div className="dres-section">
              <h4>How to score higher</h4>
              <ul className="dres-tips">
                {tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      {submission && (
        <div className="dres-section">
          <h4>Your answers {grammarFlags.length > 0 && <span className="dres-legend"><mark className="dres-mark">marked</mark> = grammar flag (hover or tap for details)</span>}</h4>
          {writtenParts.map((p) => {
            const f = PART_FIELDS[p.key]
            const improved = evaluation?.[f.improved]
            return (
              <div className="dres-answer-block" key={p.key}>
                <div className="dres-answer-head">
                  <span className="dres-answer-label">{p.label}</span>
                  {improved && (
                    <button type="button" className="dres-toggle" onClick={() => setShowImproved(showImproved === p.key ? null : p.key)}>
                      {showImproved === p.key ? 'Show my version' : 'See improved version'}
                    </button>
                  )}
                </div>
                {showImproved === p.key && improved ? (
                  <p className="dres-answer-text improved">{improved}</p>
                ) : (
                  <p className="dres-answer-text">{submission[f.answer] ? highlightFlags(submission[f.answer], grammarFlags) : '(no answer given)'}</p>
                )}
              </div>
            )
          })}
          {cfg.parts.some((p) => p.key === 'comprehension') && compAnswers.map((a, i) => (
            <div className="dres-answer-block" key={`c${i}`}>
              <div className="dres-answer-label">Comprehension {i + 1}</div>
              <p className="dres-answer-text">{a ? highlightFlags(a, grammarFlags) : '(no answer given)'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
