import { useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, Pencil, Trash2, X } from 'lucide-react'
import { Modal } from '../ui'
import { QuestionBody, optionKeys } from '../Question'
import { RichText } from '../RichText'
import { Solution } from '../Solution'
import { OPT_KEYS } from '../../lib/topics'
import { deleteMockQuestion, saveMockQuestion, uploadCoachingImage } from '../../lib/coaching'

const EMPTY = {
  passage: '', image_url: '', question: '',
  option_a: '', option_b: '', option_c: '', option_d: '', option_e: '',
  correct_option: '', explanation: '', explanation_hi: '',
}
// Kept after saving, so the next question of a DI set / puzzle / RC passage
// only needs its own question and options.
const KEEP_FOR_NEXT = ['passage', 'image_url']
const trimOrNull = (v) => (v.trim() === '' ? null : v.trim())
const fromRow = (q) => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, q[k] ?? '']))

function toRow(form) {
  return {
    passage: trimOrNull(form.passage),
    image_url: trimOrNull(form.image_url),
    question: form.question.trim(),
    option_a: form.option_a.trim(),
    option_b: form.option_b.trim(),
    option_c: form.option_c.trim(),
    option_d: form.option_d.trim(),
    option_e: trimOrNull(form.option_e),
    correct_option: form.correct_option,
    explanation: trimOrNull(form.explanation),
    explanation_hi: trimOrNull(form.explanation_hi),
  }
}

function validate(form) {
  if (!form.question.trim()) return 'Write the question.'
  const missing = ['a', 'b', 'c', 'd'].filter((k) => !form[`option_${k}`].trim())
  if (missing.length) return `Fill option ${missing.map((k) => k.toUpperCase()).join(', ')}.`
  if (!form.correct_option) return 'Pick the correct option (tap its letter).'
  if (!form[`option_${form.correct_option}`].trim()) return `Option ${form.correct_option.toUpperCase()} is marked correct but is empty.`
  return null
}

// Add / edit / delete the questions of one mock, section by section.
export function MockQuestions({ mock, coachingId, questions, onChanged }) {
  const draft = mock.status === 'draft'
  const [sectionId, setSectionId] = useState(mock.sections[0]?.id ?? null)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const formRef = useRef(null)
  const questionRef = useRef(null)
  const fileRef = useRef(null)

  const section = mock.sections.find((s) => s.id === sectionId) || mock.sections[0]
  const list = useMemo(() => questions.filter((q) => q.section_id === section?.id), [questions, section])
  const editing = editingId ? questions.find((q) => q.id === editingId) : null

  if (!section) {
    return <p className="muted">Add sections in <b>Settings</b> first — questions go into a section.</p>
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const reset = () => { setEditingId(null); setForm(EMPTY); setError(''); setNotice('') }

  const startEdit = (q) => {
    setEditingId(q.id)
    setForm(fromRow(q))
    setError('')
    setNotice('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const upload = async (file) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const url = await uploadCoachingImage(file, coachingId, mock.id)
      setForm((f) => ({ ...f, image_url: url }))
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onPaste = (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'))
    if (file) { e.preventDefault(); upload(file) }
  }

  const save = async () => {
    if (saving || uploading) return
    const problem = validate(form)
    if (problem) { setError(problem); setNotice(''); return }
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const keyChanged = editing && editing.correct_option !== form.correct_option
        await saveMockQuestion(toRow(form), editingId)
        setNotice(keyChanged && !draft ? 'Updated. Students’ results were re-scored with the new answer.' : 'Question updated.')
        setEditingId(null)
        setForm(EMPTY)
      } else {
        const position = list.reduce((m, q) => Math.max(m, q.position), 0) + 1
        await saveMockQuestion({ ...toRow(form), section_id: section.id, position })
        const kept = form.passage || form.image_url
        setNotice(`Saved question ${list.length + 1} in ${section.name}.${kept ? ' Passage and picture are kept for the next question.' : ''}`)
        setForm((f) => ({ ...EMPTY, ...Object.fromEntries(KEEP_FOR_NEXT.map((k) => [k, f[k]])) }))
      }
      questionRef.current?.focus()
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    const q = toDelete
    setToDelete(null)
    try {
      await deleteMockQuestion(q.id)
      if (editingId === q.id) reset()
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  const preview = { ...toRow(form), question: form.question || 'Your question appears here.' }
  const canAdd = draft || editingId

  return (
    <>
      <div className="segmented coach-section-pick" role="tablist" aria-label="Section">
        {mock.sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === section.id}
            className={s.id === section.id ? 'active' : ''}
            disabled={!!editingId}
            onClick={() => { setSectionId(s.id); setNotice('') }}
          >
            {s.name} <span className="muted">{questions.filter((q) => q.section_id === s.id).length}</span>
          </button>
        ))}
      </div>

      {!draft && !editingId && (
        <p className="admin-hint">This mock is published, so questions can&apos;t be added or deleted. Tap ✎ on a question to fix a typo or its answer.</p>
      )}

      {canAdd && (
        <div className="admin-grid">
          <form
            ref={formRef}
            className="card admin-form"
            onSubmit={(e) => { e.preventDefault(); save() }}
            onPaste={onPaste}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }}
          >
            {editingId && (
              <div className="admin-editing">
                <span>Editing question {list.findIndex((q) => q.id === editingId) + 1} of {section.name}</span>
                <button type="button" className="link-btn small" onClick={reset}>Cancel edit</button>
              </div>
            )}
            <label className="field">
              <span>Passage <em>(optional: puzzle clues, DI data, RC passage)</em></span>
              <textarea rows={4} value={form.passage} onChange={set('passage')} />
            </label>
            <div className="field">
              <span>Picture <em>(optional: chart or diagram; you can also paste a screenshot with Ctrl+V)</em></span>
              {form.image_url ? (
                <div className="admin-image">
                  <img src={form.image_url} alt="Picture attached to this question" loading="lazy" />
                  <button type="button" className="btn small ghost" onClick={() => setForm((f) => ({ ...f, image_url: '' }))}><X size={14} /> Remove</button>
                </div>
              ) : (
                <label className={`admin-upload${uploading ? ' busy' : ''}`}>
                  <ImagePlus size={18} />
                  <span>{uploading ? 'Uploading…' : 'Choose a picture'}</span>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
                </label>
              )}
            </div>
            <label className="field">
              <span>Question</span>
              <textarea ref={questionRef} rows={3} value={form.question} onChange={set('question')} required />
            </label>
            <fieldset className="admin-options">
              <legend>Options <em>(tap the letter to mark the correct one)</em></legend>
              {OPT_KEYS.map((k) => (
                <div key={k} className={`admin-option${form.correct_option === k ? ' is-correct' : ''}`}>
                  <button
                    type="button"
                    className="admin-opt-key"
                    aria-pressed={form.correct_option === k}
                    aria-label={`Mark option ${k.toUpperCase()} correct`}
                    onClick={() => setForm((f) => ({ ...f, correct_option: k }))}
                  >
                    {form.correct_option === k ? <Check size={14} /> : k.toUpperCase()}
                  </button>
                  <input
                    value={form[`option_${k}`]}
                    onChange={set(`option_${k}`)}
                    placeholder={k === 'e' ? 'Option E (leave empty for 4 options)' : `Option ${k.toUpperCase()}`}
                    aria-label={`Option ${k.toUpperCase()}`}
                  />
                </div>
              ))}
            </fieldset>
            <label className="field"><span>Solution in English <em>(optional, shown after the test)</em></span><textarea rows={3} value={form.explanation} onChange={set('explanation')} /></label>
            <label className="field"><span>Solution in Hinglish <em>(optional)</em></span><textarea rows={3} value={form.explanation_hi} onChange={set('explanation_hi')} /></label>
            <p className="admin-hint">
              Maths: write it between dollar signs: <code>$\frac{'{3}{4}'}$</code> <code>$x^2$</code> <code>$\sqrt{'{196}'}$</code>. Line breaks are kept.
            </p>
            {error && <p className="error" role="alert">{error}</p>}
            {notice && !error && <p className="admin-notice" role="status"><Check size={14} /> {notice}</p>}
            <div className="admin-actions">
              <button type="button" className="btn ghost" onClick={reset}>{editingId ? 'Cancel' : 'Clear form'}</button>
              <button type="submit" className="btn primary" disabled={saving || uploading}>
                {saving ? 'Saving…' : editingId ? 'Update question' : `Add to ${section.name}`}
              </button>
            </div>
            <p className="admin-hint subtle">Ctrl + Enter saves.</p>
          </form>

          <aside className="admin-preview" aria-label="Preview">
            <h2 className="section-title">Preview</h2>
            <section className="card question-card">
              <QuestionBody question={preview} />
              <div className="options">
                {optionKeys(preview).map((k) => (
                  <div key={k} className={`option${preview.correct_option === k ? ' correct' : ''}`}>
                    <span className="opt-key">{preview.correct_option === k ? <Check size={14} /> : k.toUpperCase()}</span>
                    <span className="opt-text"><RichText text={preview[`option_${k}`]} /></span>
                  </div>
                ))}
              </div>
              <Solution question={preview} defaultOpen />
            </section>
          </aside>
        </div>
      )}
      {!canAdd && notice && <p className="admin-notice" role="status"><Check size={14} /> {notice}</p>}
      {!canAdd && error && <p className="error" role="alert">{error}</p>}

      <section className="admin-list">
        <h2 className="section-title">{section.name} · {list.length} question{list.length === 1 ? '' : 's'}</h2>
        {list.length === 0 ? (
          <p className="muted">No questions in this section yet. Add them above, or use <b>Import</b> for a whole sheet.</p>
        ) : (
          <ul className="admin-rows">
            {list.map((q, i) => (
              <li key={q.id} className={`card admin-row${editingId === q.id ? ' editing' : ''}`}>
                <span className="admin-row-id">{i + 1}</span>
                <span className="admin-row-text">{q.image_url && <ImagePlus size={13} aria-label="Has picture" />} {q.question}</span>
                <span className="admin-row-key">{q.correct_option.toUpperCase()}</span>
                <button type="button" className="icon-btn" aria-label={`Edit question ${i + 1}`} onClick={() => startEdit(q)}><Pencil size={15} /></button>
                {draft && <button type="button" className="icon-btn danger" aria-label={`Delete question ${i + 1}`} onClick={() => setToDelete(q)}><Trash2 size={15} /></button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        tone="danger"
        title="Delete this question?"
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setToDelete(null)}>Cancel</button>
            <button type="button" className="btn danger-solid" onClick={confirmDelete}>Delete</button>
          </>
        )}
      >
        <p>{toDelete?.question}</p>
      </Modal>
    </>
  )
}
