import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Plus, Send, Trash2, Undo2 } from 'lucide-react'
import { Modal } from '../ui'
import { navigate } from '../../lib/router'
import { useApp } from '../../lib/appContext'
import {
  NEGATIVE_MARKS, PACK_LEVELS, SECTION_PRESETS, addSection, deleteMock, deleteSection, fetchMyCoaching, formatMinutes, updateMock, updateSection,
} from '../../lib/coaching'

// Mock settings: name, timing, negative marking and the sections. Section
// rows are added / deleted straight away (drafts only); everything else is
// saved with "Save settings".
export function MockSettings({ mock, questions, onChanged }) {
  const draft = mock.status === 'draft'
  const [f, setF] = useState(() => ({
    title: mock.title,
    instructions: mock.instructions || '',
    sectional: mock.sectional_timing,
    minutes: mock.duration_sec ? String(mock.duration_sec / 60) : '60',
    negative: String(Number(mock.negative_mark)),
    packLevel: String(mock.pack_level ?? 3),
  }))
  // Fedge's own coaching picks which plans get each mock.
  const { user } = useApp()
  const [isFedge, setIsFedge] = useState(false)
  useEffect(() => {
    if (!('pack_level' in mock)) return undefined
    let cancelled = false
    fetchMyCoaching(user.id).then((c) => { if (!cancelled) setIsFedge(!!c?.is_fedge) }).catch(() => {})
    return () => { cancelled = true }
  }, [mock, user.id])
  const [secs, setSecs] = useState(() => mock.sections.map(toRow))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [toDelete, setToDelete] = useState(null) // section row, or 'mock'
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setNotice('') }
  const setSec = (i, k, v) => { setSecs((list) => list.map((s, j) => (j === i ? { ...s, [k]: v } : s))); setNotice('') }
  const move = (i, d) => setSecs((list) => {
    const n = [...list]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    return n
  })
  const countIn = (sectionId) => questions.filter((q) => q.section_id === sectionId).length
  const totalSec = f.sectional ? secs.reduce((n, s) => n + (Number(s.minutes) || 0) * 60, 0) : (Number(f.minutes) || 0) * 60

  const problem = () => {
    if (f.title.trim().length < 2) return 'Give the mock a name.'
    if (!f.sectional && !(Number(f.minutes) >= 1 && Number(f.minutes) <= 300)) return 'Test time must be 1–300 minutes.'
    for (const s of secs) {
      if (!s.name.trim()) return 'Every section needs a name.'
      if (f.sectional && !(Number(s.minutes) >= 1 && Number(s.minutes) <= 180)) return `${s.name}: time must be 1–180 minutes.`
      if (!(Number(s.marks) > 0 && Number(s.marks) <= 10)) return `${s.name}: marks per question must be more than 0 and at most 10.`
    }
    return null
  }

  const save = async () => {
    const p = problem()
    if (p) { setError(p); return false }
    setBusy(true)
    setError('')
    try {
      await updateMock(mock.id, {
        title: f.title.trim(),
        instructions: f.instructions.trim() || null,
        sectional_timing: f.sectional,
        duration_sec: f.sectional ? null : Math.round(Number(f.minutes) * 60),
        negative_mark: Number(f.negative),
        ...(isFedge ? { pack_level: Number(f.packLevel) } : {}),
      })
      await Promise.all(secs.map((s, i) => {
        const orig = mock.sections.find((o) => o.id === s.id)
        const next = {
          name: s.name.trim(),
          duration_sec: f.sectional ? Math.round(Number(s.minutes) * 60) : orig?.duration_sec ?? 1200,
          marks_per_question: Number(s.marks),
          position: i,
        }
        const same = orig && orig.name === next.name && orig.duration_sec === next.duration_sec
          && Number(orig.marks_per_question) === next.marks_per_question && orig.position === i
        return same ? null : updateSection(s.id, next)
      }))
      setNotice('Settings saved.')
      onChanged()
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (name = `Section ${secs.length + 1}`, minutes = 20, marks = 1) => {
    const row = await addSection(mock.id, { name, duration_sec: minutes * 60, marks_per_question: marks, position: secs.length })
    setSecs((list) => [...list, toRow(row)])
    return row
  }

  const addOne = async () => {
    setError('')
    try { await add(); onChanged() } catch (e) { setError(e.message) }
  }

  const applyPreset = async (preset) => {
    setBusy(true)
    setError('')
    try {
      for (const s of preset.sections) await add(s.name, s.minutes, s.marks)
      setF((x) => (preset.oneClock
        ? { ...x, sectional: false, minutes: String(preset.oneClock) }
        : { ...x, sectional: preset.sections.length > 1 || x.sectional }))
      setNotice(
        `Added ${preset.label} sections. Suggested questions: ${preset.sections.map((s) => `${s.name} ${s.guide}`).join(', ')}.`
        + `${preset.oneClock ? ` The paper runs on one ${preset.oneClock}-minute clock.` : ''} Press Save settings to keep the timing.`,
      )
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    const target = toDelete
    setToDelete(null)
    setError('')
    try {
      if (target === 'mock') {
        await deleteMock(mock.id)
        navigate(`/coach/series/${mock.series_id}`, { replace: true })
        return
      }
      await deleteSection(target.id)
      setSecs((list) => list.filter((s) => s.id !== target.id))
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  const publish = async () => {
    if (!(await save())) return
    setBusy(true)
    setError('')
    try {
      await updateMock(mock.id, { status: 'published' })
      setNotice('Published. Students with a code for this series can take it now.')
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const unpublish = async () => {
    setBusy(true)
    setError('')
    try {
      await updateMock(mock.id, { status: 'draft' })
      setNotice('Back to draft. Students can’t see it now.')
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="coach-settings">
      <section className={`card coach-publish ${draft ? 'is-draft' : 'is-live'}`}>
        <div>
          <h2>{draft ? 'Draft' : 'Published'}</h2>
          <p className="muted small">
            {draft
              ? 'Only you can see this mock. Publish it when every section has its questions.'
              : `Students in this series can take it.${mock.attemptCount ? ` ${mock.attemptCount} attempt${mock.attemptCount === 1 ? '' : 's'} so far.` : ''} Sections and questions can't be added or removed now, but you can still fix typos and answer keys (results are re-scored).`}
          </p>
        </div>
        {draft
          ? <button type="button" className="btn primary" onClick={publish} disabled={busy}><Send size={15} /> Publish</button>
          : mock.attemptCount === 0 && <button type="button" className="btn" onClick={unpublish} disabled={busy}><Undo2 size={15} /> Back to draft</button>}
      </section>

      <section className="card admin-form coach-form">
        <label className="field"><span>Mock name</span><input value={f.title} onChange={set('title')} maxLength={100} /></label>
        <div className="field">
          <span>Timing</span>
          <div className="segmented" role="radiogroup" aria-label="Timing">
            <button type="button" role="radio" aria-checked={f.sectional} className={f.sectional ? 'active' : ''} onClick={() => setF((x) => ({ ...x, sectional: true }))}>Clock per section</button>
            <button type="button" role="radio" aria-checked={!f.sectional} className={!f.sectional ? 'active' : ''} onClick={() => setF((x) => ({ ...x, sectional: false }))}>One clock for the test</button>
          </div>
        </div>
        <div className="coach-form-row">
          {!f.sectional && (
            <label className="field"><span>Test time (minutes)</span><input type="number" min={1} max={300} value={f.minutes} onChange={set('minutes')} /></label>
          )}
          <label className="field">
            <span>Negative marking (per wrong answer)</span>
            <select value={f.negative} onChange={set('negative')}>
              {NEGATIVE_MARKS.map((n) => <option key={n.value} value={String(n.value)}>{n.label}</option>)}
            </select>
          </label>
        </div>
        {isFedge && (
          <label className="field">
            <span>Fedge pack: who gets this mock <em>(coachings on these plans get a copy once it&apos;s published)</em></span>
            <select value={f.packLevel} onChange={set('packLevel')}>
              {PACK_LEVELS.map((l) => <option key={l.value} value={String(l.value)}>{l.label}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Instructions from you <em>(optional, shown before the test starts)</em></span>
          <textarea rows={3} value={f.instructions} onChange={set('instructions')} maxLength={3000} />
        </label>

        <div className="field">
          <span>Sections {totalSec > 0 && <em>· total {formatMinutes(totalSec)}</em>}</span>
          {secs.length === 0 && (
            <div className="coach-presets">
              <p className="admin-hint">Start from an exam pattern, or add sections one by one.</p>
              <div className="coach-preset-row">
                {SECTION_PRESETS.map((p) => (
                  <button key={p.key} type="button" className="btn small" disabled={busy || !draft} onClick={() => applyPreset(p)}>{p.label}</button>
                ))}
              </div>
            </div>
          )}
          {secs.length > 0 && (
            <ul className="coach-sections">
              {secs.map((s, i) => (
                <li key={s.id} className="coach-section-row">
                  <input className="coach-section-name" value={s.name} onChange={(e) => setSec(i, 'name', e.target.value)} maxLength={60} aria-label={`Section ${i + 1} name`} />
                  {f.sectional && (
                    <label className="coach-mini-field"><input type="number" min={1} max={180} value={s.minutes} onChange={(e) => setSec(i, 'minutes', e.target.value)} /> min</label>
                  )}
                  <label className="coach-mini-field"><input type="number" min={0.25} max={10} step={0.25} value={s.marks} onChange={(e) => setSec(i, 'marks', e.target.value)} /> marks/Q</label>
                  <span className="muted small coach-section-count">{countIn(s.id)} Q</span>
                  <span className="coach-section-tools">
                    <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="icon-btn" aria-label="Move down" disabled={i === secs.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                    {draft && <button type="button" className="icon-btn danger" aria-label={`Delete ${s.name}`} onClick={() => setToDelete(s)}><Trash2 size={14} /></button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {draft && secs.length > 0 && (
            <button type="button" className="btn small ghost coach-add-section" onClick={addOne} disabled={busy}><Plus size={14} /> Add section</button>
          )}
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {notice && !error && <p className="admin-notice" role="status"><Check size={14} /> {notice}</p>}
        <div className="admin-actions">
          <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        </div>
      </section>

      <div className="card coach-danger">
        <div>
          <h3>Delete this mock</h3>
          <p className="muted small">Deletes its questions{mock.attemptCount ? ` and ${mock.attemptCount} student result${mock.attemptCount === 1 ? '' : 's'}` : ''}.</p>
        </div>
        <button type="button" className="btn danger" onClick={() => setToDelete('mock')}><Trash2 size={15} /> Delete</button>
      </div>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        tone="danger"
        title={toDelete === 'mock' ? `Delete “${mock.title}”?` : `Delete section “${toDelete?.name}”?`}
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setToDelete(null)}>Cancel</button>
            <button type="button" className="btn danger-solid" onClick={confirmDelete}>Delete</button>
          </>
        )}
      >
        <p>
          {toDelete === 'mock'
            ? 'This can’t be undone.'
            : `${countIn(toDelete?.id)} question${countIn(toDelete?.id) === 1 ? '' : 's'} in it will be deleted too.`}
        </p>
      </Modal>
    </div>
  )
}

const toRow = (s) => ({ id: s.id, name: s.name, minutes: String(s.duration_sec / 60), marks: String(Number(s.marks_per_question)) })
