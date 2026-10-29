import { useState } from 'react'
import { OPT_KEYS } from '../lib/topics'
import { RichText } from './RichText'

// Options present on a question (4-option questions leave option_e empty).
export const optionKeys = (q) => OPT_KEYS.filter((k) => q?.[`option_${k}`] !== null && q?.[`option_${k}`] !== undefined && String(q[`option_${k}`]).trim() !== '')

// Question text with its optional shared passage (puzzle clues, DI data,
// reading passage) and picture (chart, diagram) shown above it.
export function QuestionBody({ question, compact = false }) {
  return (
    <>
      {question.passage && <div className={`q-passage${compact ? ' compact' : ''}`}><PassageText text={question.passage} /></div>}
      {question.image_url && <QuestionImage src={question.image_url} compact={compact} />}
      <div className={compact ? 'review-q' : 'q-text'}><RichText text={question.question} /></div>
    </>
  )
}

// Tap to view a wide chart at full size (scrolls sideways on a phone).
export function QuestionImage({ src, compact }) {
  const [zoomed, setZoomed] = useState(false)
  return (
    <button
      type="button"
      className={`q-image${compact ? ' compact' : ''}${zoomed ? ' zoomed' : ''}`}
      onClick={() => setZoomed((z) => !z)}
      aria-label={zoomed ? 'Fit picture to screen' : 'Show picture at full size'}
    >
      {/* Lazy: results and the notebook list many questions, most below the fold. */}
      <img src={src} alt="Figure for this question (chart, table or diagram)" loading="lazy" decoding="async" />
    </button>
  )
}

// A passage is plain text, except that a run of lines written as
// "| a | b | c |" is shown as a table (first row = column headings; a
// "|---|---|" line is ignored). DI table sets keep their data this way.
const isTableLine = (line) => line.length > 2 && line.startsWith('|') && line.endsWith('|')
const isRuleRow = (cells) => cells.every((c) => /^:?-{2,}:?$/.test(c))

export function PassageText({ text }) {
  const blocks = []
  let lines = []
  let rows = []
  const flushText = () => {
    if (lines.length) blocks.push({ text: lines.join('\n') })
    lines = []
  }
  const flushTable = () => {
    if (rows.length) blocks.push({ rows })
    rows = []
  }
  String(text).split('\n').forEach((raw) => {
    const line = raw.trim()
    if (isTableLine(line)) {
      flushText()
      const cells = line.slice(1, -1).split('|').map((c) => c.trim())
      if (!isRuleRow(cells)) rows.push(cells)
    } else {
      flushTable()
      lines.push(raw)
    }
  })
  flushText()
  flushTable()
  return blocks.map((b, i) => (b.rows ? (
    <div className="q-table-wrap" key={i}>
      <table className="q-table">
        <thead><tr>{b.rows[0].map((c, j) => <th key={j}><RichText text={c} /></th>)}</tr></thead>
        <tbody>
          {b.rows.slice(1).map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => (ci === 0 ? <th scope="row" key={ci}><RichText text={c} /></th> : <td key={ci}><RichText text={c} /></td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : <span key={i}><RichText text={b.text} />{'\n'}</span>))
}
