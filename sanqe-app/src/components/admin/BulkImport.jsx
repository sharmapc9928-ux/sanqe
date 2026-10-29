import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Download, FileUp } from 'lucide-react'
import { useApp } from '../../lib/appContext'
import { fetchExistingForTopics, insertQuestions } from '../../lib/admin'
import { parseDelimited, toCsv } from '../../lib/csv'
import { TEMPLATE_HEADERS, checkImport, markDuplicates } from '../../lib/importRows'
import { TOPIC_BY_KEY } from '../../lib/syllabus'
import { ADMIN_TOPICS, TopicSelect } from './TopicSelect'

const PREVIEW_ROWS = 20

function downloadTemplate() {
  const example = {
    topic: 'percentage',
    question: 'A number is increased by 20% and then decreased by 20%. What is the net change?',
    option_a: 'No change', option_b: '4% decrease', option_c: '4% increase', option_d: '2% decrease',
    correct_option: 'b',
    explanation: 'Net change = $20 - 20 - \\frac{20 \\times 20}{100} = -4\\%$',
    source: 'Book name p. 12',
  }
  const csv = toCsv([TEMPLATE_HEADERS, TEMPLATE_HEADERS.map((h) => example[h] ?? '')])
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'sanqe-questions-template.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function BulkImport() {
  const { refreshCounts } = useApp()
  const [defaultTopic, setDefaultTopic] = useState(() => ADMIN_TOPICS.find((t) => !t.table).key)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [check, setCheck] = useState(null) // result of checkImport + duplicates
  const [phase, setPhase] = useState('idle') // idle | checking | importing | done
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const fileRef = useRef(null)

  const reset = () => { setCheck(null); setError(''); setResult(''); setPhase('idle') }

  const onFile = async (file) => {
    if (!file) return
    reset()
    setFileName(file.name)
    setText(await file.text())
    if (fileRef.current) fileRef.current.value = ''
  }

  const runCheck = async () => {
    setError('')
    setResult('')
    setPhase('checking')
    try {
      const parsed = checkImport(parseDelimited(text), { topics: ADMIN_TOPICS, defaultTopic })
      if (parsed.error) { setError(parsed.error); setCheck(null); setPhase('idle'); return }
      const topics = [...new Set(parsed.items.filter((i) => !i.errors.length && i.topic).map((i) => i.topic))]
      const existing = await fetchExistingForTopics(topics)
      setCheck({ ...parsed, items: markDuplicates(parsed.items, existing) })
    } catch (e) {
      setError(e.message)
    }
    setPhase('idle')
  }

  const groups = useMemo(() => {
    if (!check) return null
    return {
      ready: check.items.filter((i) => !i.errors.length && !i.duplicate),
      bad: check.items.filter((i) => i.errors.length),
      dup: check.items.filter((i) => i.duplicate),
    }
  }, [check])

  const runImport = async () => {
    if (!groups?.ready.length) return
    setPhase('importing')
    setProgress(0)
    setError('')
    try {
      const n = await insertQuestions(groups.ready, setProgress)
      const skipped = groups.bad.length + groups.dup.length
      setResult(`Imported ${n} question${n === 1 ? '' : 's'}.${skipped ? ` Skipped ${skipped} (errors or duplicates). Fix the error rows in your sheet and import the same file again; rows already imported are skipped automatically.` : ''}`)
      setCheck(null)
      setPhase('done')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
      if (e.saved) setCheck(null)
    }
    refreshCounts()
  }

  const busy = phase === 'checking' || phase === 'importing'

  return (
    <div className="admin-import">
      <section className="card admin-form">
        <div className="admin-import-head">
          <div>
            <h2 className="admin-card-title">Import many questions at once</h2>
            <p className="admin-hint">
              One question per row, with the template&apos;s header row. Save from Excel / Google Sheets as CSV, or copy the cells
              (header row included) and paste them below. <code>correct_option</code> can be A–E or 1–5.
            </p>
          </div>
          <button type="button" className="btn small" onClick={downloadTemplate}><Download size={14} /> Template</button>
        </div>

        <TopicSelect
          label="Topic for rows without one"
          hint="(used when the topic column is empty or missing)"
          value={defaultTopic}
          onChange={(v) => { setDefaultTopic(v); setCheck(null) }}
        />

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
            placeholder={`${TEMPLATE_HEADERS.join(',')}\npercentage,,,What is 25% of 80?,10,20,25,30,,b,,,`}
            spellCheck={false}
            className="mono"
          />
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        {result && <p className="admin-notice" role="status"><Check size={14} /> {result}</p>}

        <div className="admin-actions">
          <button type="button" className="btn primary" onClick={runCheck} disabled={!text.trim() || busy}>
            {phase === 'checking' ? 'Checking…' : 'Check rows'}
          </button>
        </div>
      </section>

      {groups && (
        <section className="admin-import-result">
          <div className="admin-import-summary">
            <span className="ok"><b>{groups.ready.length}</b> ready</span>
            <span className="bad"><b>{groups.bad.length}</b> with errors</span>
            <span className="muted"><b>{groups.dup.length}</b> already there (skipped)</span>
          </div>
          {check.ignoredHeaders.length > 0 && (
            <p className="admin-hint"><AlertTriangle size={13} /> Ignored unknown column{check.ignoredHeaders.length === 1 ? '' : 's'}: {check.ignoredHeaders.join(', ')}</p>
          )}

          {groups.bad.length > 0 && (
            <div className="card admin-import-errors">
              <h3>Fix these rows in your sheet</h3>
              <ul>
                {groups.bad.map((i) => (
                  <li key={i.row}><b>Row {i.row}:</b> {i.errors.join('; ')}</li>
                ))}
              </ul>
            </div>
          )}

          {groups.ready.length > 0 && (
            <>
              <div className="card admin-import-preview">
                <table>
                  <thead><tr><th>Row</th><th>Topic</th><th>Question</th><th>Ans</th></tr></thead>
                  <tbody>
                    {groups.ready.slice(0, PREVIEW_ROWS).map((i) => (
                      <tr key={i.row}>
                        <td>{i.row}</td>
                        <td>{TOPIC_BY_KEY[i.topic]?.short}</td>
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
                  {phase === 'importing'
                    ? `Importing… ${progress} / ${groups.ready.length}`
                    : `Import ${groups.ready.length} question${groups.ready.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
