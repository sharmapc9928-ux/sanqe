import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Download, FileUp } from 'lucide-react'
import { parseDelimited, toCsv } from '../../lib/csv'
import { MOCK_TEMPLATE_HEADERS, checkMockImport } from '../../lib/mockImport'
import { addSection, downloadCsv, insertMockQuestions } from '../../lib/coaching'

const PREVIEW_ROWS = 20

function downloadTemplate() {
  const examples = [
    {
      section: 'Quantitative Aptitude',
      question: 'A number is increased by 20% and then decreased by 20%. What is the net change?',
      option_a: 'No change', option_b: '4% decrease', option_c: '4% increase', option_d: '2% decrease', option_e: '2% increase',
      correct_option: 'B',
      explanation: 'Net change = $20 - 20 - \\frac{20 \\times 20}{100} = -4\\%$',
    },
    {
      section: 'English Language',
      question: 'Choose the word most similar in meaning to ABUNDANT.',
      option_a: 'Scarce', option_b: 'Plentiful', option_c: 'Rare', option_d: 'Tiny', option_e: 'Empty',
      correct_option: 'B',
    },
  ]
  downloadCsv('mock-questions-template.csv', toCsv([MOCK_TEMPLATE_HEADERS, ...examples.map((ex) => MOCK_TEMPLATE_HEADERS.map((h) => ex[h] ?? ''))]))
}

// Import a whole sheet of questions into a mock. Rows are checked first;
// sections are matched by name (and created, while the mock is a draft).
export function MockImport({ mock, questions, onChanged }) {
  const draft = mock.status === 'draft'
  const [defaultSection, setDefaultSection] = useState(mock.sections[0]?.id ?? '')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [check, setCheck] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | importing
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const fileRef = useRef(null)

  const reset = () => { setCheck(null); setError(''); setResult('') }

  const onFile = async (file) => {
    if (!file) return
    reset()
    setFileName(file.name)
    setText(await file.text())
    if (fileRef.current) fileRef.current.value = ''
  }

  const runCheck = () => {
    setError('')
    setResult('')
    const parsed = checkMockImport(parseDelimited(text), {
      sections: mock.sections,
      defaultSection: defaultSection === '' ? null : Number(defaultSection),
      canAddSections: draft,
      existing: questions,
    })
    if (parsed.error) { setError(parsed.error); setCheck(null); return }
    setCheck(parsed)
  }

  const groups = useMemo(() => {
    if (!check) return null
    return {
      ready: check.items.filter((i) => !i.errors.length && !i.duplicate),
      bad: check.items.filter((i) => i.errors.length),
      dup: check.items.filter((i) => i.duplicate),
    }
  }, [check])

  const sectionName = (s) => (typeof s === 'object' && s ? s.name : mock.sections.find((x) => x.id === s)?.name || '?')

  const runImport = async () => {
    if (!groups?.ready.length || !draft) return
    setPhase('importing')
    setProgress(0)
    setError('')
    try {
      // Create the new sections first, then append each row after the
      // questions already in its section, in sheet order.
      const ids = new Map()
      let position = mock.sections.length
      for (const name of check.newSections) {
        if (!groups.ready.some((i) => typeof i.section === 'object' && i.section.name === name)) continue
        const row = await addSection(mock.id, { name, duration_sec: 1200, marks_per_question: 1, position: position++ })
        ids.set(name, row.id)
      }
      const nextPos = new Map()
      questions.forEach((q) => nextPos.set(q.section_id, Math.max(nextPos.get(q.section_id) || 0, q.position)))
      const rows = groups.ready.map((i) => {
        const sectionId = typeof i.section === 'object' ? ids.get(i.section.name) : i.section
        const pos = (nextPos.get(sectionId) || 0) + 1
        nextPos.set(sectionId, pos)
        return { ...i.data, section_id: sectionId, position: pos }
      })
      const n = await insertMockQuestions(rows, setProgress)
      const skipped = groups.bad.length + groups.dup.length
      setResult(`Imported ${n} question${n === 1 ? '' : 's'}.${ids.size ? ` New sections: ${[...ids.keys()].join(', ')} (20 min each — check Settings).` : ''}${skipped ? ` Skipped ${skipped} (errors or duplicates).` : ''}`)
      setCheck(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setPhase('idle')
      onChanged()
    }
  }

  if (!draft) {
    return <p className="muted">This mock is published, so you can&apos;t import more questions into it. Create a new mock instead.</p>
  }

  const busy = phase === 'importing'

  return (
    <div className="admin-import">
      <section className="card admin-form">
        <div className="admin-import-head">
          <div>
            <h2 className="admin-card-title">Import questions from Excel / Google Sheets</h2>
            <p className="admin-hint">
              One question per row with the template&apos;s header row. Save as CSV, or copy the cells (header included) and paste below.
              The <code>section</code> column must match a section name — new names become new sections.
              <code>correct_option</code> can be A–E or 1–5. Leave <code>option_e</code> empty for 4-option questions.
            </p>
          </div>
          <button type="button" className="btn small" onClick={downloadTemplate}><Download size={14} /> Template</button>
        </div>

        <label className="field">
          <span>Section for rows without one</span>
          <select value={defaultSection} onChange={(e) => { setDefaultSection(e.target.value); setCheck(null) }}>
            <option value="">— none (every row must name its section) —</option>
            {mock.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <label className={`admin-upload${busy ? ' busy' : ''}`}>
          <FileUp size={18} />
          <span>{fileName ? `${fileName} (choose another)` : 'Choose a CSV file'}</span>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>

        <label className="field">
          <span>…or paste the rows here</span>
          <textarea
            rows={6}
            value={text}
            onChange={(e) => { setText(e.target.value); setFileName(''); reset() }}
            placeholder={`${MOCK_TEMPLATE_HEADERS.join(',')}\nReasoning Ability,,,Which is the odd one out?,Apple,Mango,Potato,Banana,,C,,`}
            spellCheck={false}
            className="mono"
          />
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        {result && <p className="admin-notice" role="status"><Check size={14} /> {result}</p>}

        <div className="admin-actions">
          <button type="button" className="btn primary" onClick={runCheck} disabled={!text.trim() || busy}>Check rows</button>
        </div>
      </section>

      {groups && (
        <section className="admin-import-result">
          <div className="admin-import-summary">
            <span className="ok"><b>{groups.ready.length}</b> ready</span>
            <span className="bad"><b>{groups.bad.length}</b> with errors</span>
            <span className="muted"><b>{groups.dup.length}</b> already in this mock (skipped)</span>
          </div>
          {check.ignoredHeaders.length > 0 && (
            <p className="admin-hint"><AlertTriangle size={13} /> Ignored unknown column{check.ignoredHeaders.length === 1 ? '' : 's'}: {check.ignoredHeaders.join(', ')}</p>
          )}
          {check.newSections.length > 0 && (
            <p className="admin-hint"><AlertTriangle size={13} /> New section{check.newSections.length === 1 ? '' : 's'} will be created: {check.newSections.join(', ')}</p>
          )}
          {groups.bad.length > 0 && (
            <div className="card admin-import-errors">
              <h3>Fix these rows in your sheet</h3>
              <ul>{groups.bad.map((i) => <li key={i.row}><b>Row {i.row}:</b> {i.errors.join('; ')}</li>)}</ul>
            </div>
          )}
          {groups.ready.length > 0 && (
            <>
              <div className="card admin-import-preview">
                <table>
                  <thead><tr><th>Row</th><th>Section</th><th>Question</th><th>Ans</th></tr></thead>
                  <tbody>
                    {groups.ready.slice(0, PREVIEW_ROWS).map((i) => (
                      <tr key={i.row}>
                        <td>{i.row}</td>
                        <td>{sectionName(i.section)}</td>
                        <td className="admin-import-q">{i.data.image_url ? '🖼 ' : ''}{i.data.question}</td>
                        <td>{i.data.correct_option.toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {groups.ready.length > PREVIEW_ROWS && <p className="muted small">…and {groups.ready.length - PREVIEW_ROWS} more</p>}
              </div>
              <div className="admin-actions">
                <button type="button" className="btn primary big" onClick={runImport} disabled={busy}>
                  {busy ? `Importing… ${progress} / ${groups.ready.length}` : `Import ${groups.ready.length} question${groups.ready.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
