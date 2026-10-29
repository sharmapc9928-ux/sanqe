import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, Pencil, Trash2, X } from 'lucide-react'
import { Modal } from '../ui'
import { QuestionBody, optionKeys } from '../Question'
import { RichText } from '../RichText'
import { Solution } from '../Solution'
import { useApp } from '../../lib/appContext'
import { deleteQuestion, fetchTopicQuestions, saveQuestion, uploadQuestionImage } from '../../lib/admin'
import { OPT_KEYS } from '../../lib/topics'
import { TOPIC_BY_KEY } from '../../lib/syllabus'
import { readStore, userKey, writeStore } from '../../lib/storage'
import { ADMIN_TOPICS, TopicSelect } from './TopicSelect'

const EMPTY = {
  passage: '', image_url: '', question: '',
  option_a: '', option_b: '', option_c: '', option_d: '', option_e: '',
  correct_option: '', explanation: '', explanation_hi: '', source: '',
}

// Kept after "Save" so the next question of the same set (DI chart, puzzle,
// RC passage) only needs its own question and options.
const KEEP_FOR_NEXT = ['passage', 'image_url', 'source']

const trimOrNull = (v) => (v.trim() === '' ? null : v.trim())

// The five original quant topics have their own tables: no passage, picture
// or source, and always five options.
const isOriginal = (topicKey) => !!TOPIC_BY_KEY[topicKey]?.table

function toRow(form, topic) {
  const row = {
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
  if (isOriginal(topic)) return row
  return { ...row, topic, passage: trimOrNull(form.passage), image_url: trimOrNull(form.image_url), source: trimOrNull(form.source) }
}

function validate(form, topic) {
  if (!form.question.trim()) return 'Write the question.'
  const required = isOriginal(topic) ? ['a', 'b', 'c', 'd', 'e'] : ['a', 'b', 'c', 'd']
  const missing = required.filter((k) => !form[`option_${k}`].trim())
  if (missing.length) return `Fill option ${missing.map((k) => k.toUpperCase()).join(', ')}.`
  if (!form.correct_option) return 'Pick the correct option.'
  if (!form[`option_${form.correct_option}`].trim()) return `Option ${form.correct_option.toUpperCase()} is marked correct but is empty.`
  return null
}

const fromRow = (q) => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, q[k] ?? '']))

// editRequest: { topic, question } from the Reports tab — opens that question.
export function QuestionEditor({ editRequest }) {
  const { user, refreshCounts } = useApp()
  const topicStoreKey = userKey(user.id, 'admin-topic')
  const [topic, setTopicState] = useState(() => {
    const saved = readStore(topicStoreKey, '')
    return TOPIC_BY_KEY[saved]?.practice === 'quiz' ? saved : ADMIN_TOPICS.find((t) => !t.table).key
  })
  const setTopic = (key) => { setTopicState(key); writeStore(topicStoreKey, key) }

  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [list, setList] = useState(null)
  const [listError, setListError] = useState('')
  const [filter, setFilter] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const questionRef = useRef(null)
  const fileRef = useRef(null)
  const formRef = useRef(null)
  const original = isOriginal(topic)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const loadList = useCallback(async () => {
    setListError('')
    try {
      setList(await fetchTopicQuestions(topic))
    } catch (e) {
      setList([])
      setListError(e.message)
    }
  }, [topic])
  useEffect(() => { setList(null); setFilter(''); loadList() }, [loadList])

  const startEdit = useCallback((q) => {
    setEditingId(q.id)
    setForm(fromRow(q))
    setError('')
    setNotice('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    if (!editRequest) return
    setTopicState(editRequest.topic)
    startEdit(editRequest.question)
  }, [editRequest, startEdit])

  const upload = async (file) => {
    if (!file || original) return
    setError('')
    setUploading(true)
    try {
      const url = await uploadQuestionImage(file, topic)
      setForm((f) => ({ ...f, image_url: url }))
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Paste a screenshot straight into the form (Ctrl+V).
  const onPaste = (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'))
    if (file && !original) { e.preventDefault(); upload(file) }
  }

  const save = async () => {
    if (saving || uploading) return
    const problem = validate(form, topic)
    if (problem) { setError(problem); setNotice(''); return }
    setSaving(true)
    setError('')
    try {
      const saved = await saveQuestion(topic, toRow(form, topic), editingId)
      if (editingId) {
        setNotice(`Updated question #${saved.id}.`)
        setEditingId(null)
        setForm(EMPTY)
      } else {
        const kept = !original && (form.passage || form.image_url)
        setNotice(`Saved question #${saved.id}.${kept ? ' Passage and picture are kept for the next question.' : ''}`)
        setForm((f) => ({ ...EMPTY, ...(original ? {} : Object.fromEntries(KEEP_FOR_NEXT.map((k) => [k, f[k]]))) }))
      }
      questionRef.current?.focus()
      loadList()
      refreshCounts()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => { setEditingId(null); setForm(EMPTY); setError(''); setNotice('') }

  const confirmDelete = async () => {
    const q = toDelete
    setToDelete(null)
    try {
      await deleteQuestion(topic, q.id)
      if (editingId === q.id) cancelEdit()
      setNotice(`Deleted question #${q.id}.`)
      loadList()
      refreshCounts()
    } catch (e) {
      setError(e.message)
    }
  }

  const preview = useMemo(() => ({ ...toRow(form, topic), question: form.question || 'Your question appears here.' }), [form, topic])
  const topicInfo = TOPIC_BY_KEY[topic]
  const shown = useMemo(() => {
    if (!list) return null
    const f = filter.trim().toLowerCase()
    if (!f) return list
    return list.filter((q) => String(q.id) === f.replace('#', '') || q.question.toLowerCase().includes(f))
  }, [list, filter])

  return (
    <>
      <div className="admin-toolbar">
        <TopicSelect value={topic} onChange={setTopic} disabled={!!editingId} hint={editingId ? '(finish or cancel the edit to switch)' : undefined} />
        <span className="muted small">{list ? `${list.length} question${list.length === 1 ? '' : 's'} in ${topicInfo?.name}` : 'Loading…'}</span>
      </div>

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
              <span>Editing question #{editingId}</span>
              <button type="button" className="link-btn small" onClick={cancelEdit}>Cancel edit</button>
            </div>
          )}
          {original && (
            <p className="admin-hint">{topicInfo?.name} is one of the original quant topics: five options, no passage or picture.</p>
          )}

          {!original && (
            <>
              <label className="field">
                <span>Passage <em>(optional: puzzle clues, DI data, RC passage)</em></span>
                <textarea rows={4} value={form.passage} onChange={set('passage')} />
              </label>

              <div className="field">
                <span>Picture <em>(optional: chart or diagram; you can also paste a screenshot with Ctrl+V)</em></span>
                {form.image_url ? (
                  <div className="admin-image">
                    <img src={form.image_url} alt="Picture attached to this question" loading="lazy" />
                    <button type="button" className="btn small ghost" onClick={() => setForm((f) => ({ ...f, image_url: '' }))}>
                      <X size={14} /> Remove
                    </button>
                  </div>
                ) : (
                  <label className={`admin-upload${uploading ? ' busy' : ''}`}>
                    <ImagePlus size={18} />
                    <span>{uploading ? 'Uploading…' : 'Choose a picture'}</span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      disabled={uploading}
                      onChange={(e) => upload(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>
            </>
          )}

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
                  placeholder={k === 'e' && !original ? 'Option E (leave empty for 4 options)' : `Option ${k.toUpperCase()}`}
                  aria-label={`Option ${k.toUpperCase()}`}
                />
              </div>
            ))}
          </fieldset>

          <label className="field">
            <span>Solution in English <em>(optional)</em></span>
            <textarea rows={3} value={form.explanation} onChange={set('explanation')} />
          </label>
          <label className="field">
            <span>Solution in Hinglish <em>(optional)</em></span>
            <textarea rows={3} value={form.explanation_hi} onChange={set('explanation_hi')} />
          </label>
          {!original && (
            <label className="field">
              <span>Source <em>(optional, only you see it: e.g. &quot;Arihant p. 132&quot;)</em></span>
              <input value={form.source} onChange={set('source')} />
            </label>
          )}

          <p className="admin-hint">
            Maths: write it between dollar signs: <code>$\frac{'{3}{4}'}$</code> <code>$x^2$</code> <code>$\sqrt{'{196}'}$</code> <code>$12 \times 5$</code>.
            Line breaks are kept.
          </p>

          {error && <p className="error" role="alert">{error}</p>}
          {notice && !error && <p className="admin-notice" role="status"><Check size={14} /> {notice}</p>}

          <div className="admin-actions">
            <button type="button" className="btn ghost" onClick={editingId ? cancelEdit : () => { setForm(EMPTY); setError(''); setNotice('') }}>
              {editingId ? 'Cancel' : 'Clear form'}
            </button>
            <button type="submit" className="btn primary" disabled={saving || uploading}>
              {saving ? 'Saving…' : editingId ? 'Update question' : 'Save question'}
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

      <section className="admin-list">
        <div className="admin-list-head">
          <h2 className="section-title">Questions in {topicInfo?.name}</h2>
          {list && list.length > 10 && (
            <input className="admin-search" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search text or #id" aria-label="Search questions" />
          )}
        </div>
        {listError && <p className="error">{listError}</p>}
        {shown === null ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : list.length === 0 ? (
          <p className="muted">No questions yet. The topic shows &quot;Coming soon&quot; until you add one.</p>
        ) : shown.length === 0 ? (
          <p className="muted">No question matches &quot;{filter}&quot;.</p>
        ) : (
          <ul className="admin-rows">
            {shown.map((q) => (
              <li key={q.id} className={`card admin-row${editingId === q.id ? ' editing' : ''}`}>
                <span className="admin-row-id">#{q.id}</span>
                <span className="admin-row-text">
                  {q.image_url && <ImagePlus size={13} aria-label="Has picture" />} {q.question}
                </span>
                <span className="admin-row-key">{q.correct_option.toUpperCase()}</span>
                <button type="button" className="icon-btn" aria-label={`Edit question ${q.id}`} onClick={() => startEdit(q)}><Pencil size={15} /></button>
                <button type="button" className="icon-btn danger" aria-label={`Delete question ${q.id}`} onClick={() => setToDelete(q)}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        tone="danger"
        title={`Delete question #${toDelete?.id}?`}
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setToDelete(null)}>Cancel</button>
            <button type="button" className="btn danger-solid" onClick={confirmDelete}>Delete</button>
          </>
        )}
      >
        <p>{toDelete?.question}</p>
        <p>It disappears from Practice. Students who got it wrong will no longer see it in their Mistake Notebook.</p>
      </Modal>
    </>
  )
}
