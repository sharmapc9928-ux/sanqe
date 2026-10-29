import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, ClipboardList, Copy, Download, Plus, Trash2, Undo2, UserMinus } from 'lucide-react'
import { Page } from '../../components/Layout'
import { EmptyState, Modal, SkeletonCards } from '../../components/ui'
import { linkProps, navigate } from '../../lib/router'
import { toCsv } from '../../lib/csv'
import { formatDateTime } from '../../lib/format'
import {
  createMock, deleteCode, deleteSeries, downloadCsv, fetchCodes, fetchCoachSeries, fetchSeriesMocks, fetchSeriesStudents,
  formatMinutes, generateCodes, removeStudent, setCodeRevoked, updateSeries,
} from '../../lib/coaching'
import { SeriesForm } from './CoachHome'

const TABS = [
  { key: 'mocks', label: 'Mocks' },
  { key: 'codes', label: 'Access codes' },
  { key: 'students', label: 'Students' },
  { key: 'details', label: 'Details' },
]

export default function CoachSeries({ params }) {
  const [series, setSeries] = useState(undefined)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('mocks')

  useEffect(() => {
    let cancelled = false
    fetchCoachSeries(params.series)
      .then((s) => { if (!cancelled) setSeries(s) })
      .catch((e) => { if (!cancelled) { setError(e.message); setSeries(null) } })
    return () => { cancelled = true }
  }, [params.series])

  if (series === undefined) return <Page backTo="/coach" title="Test series"><SkeletonCards count={2} height={96} /></Page>
  if (!series) {
    return (
      <Page backTo="/coach" title="Test series">
        <p className="error" role="alert">{error || 'This test series doesn’t exist or isn’t yours.'}</p>
      </Page>
    )
  }

  return (
    <Page
      backTo="/coach"
      title={series.title}
      subtitle={series.exam || 'Test series'}
      className="coach-page"
    >
      <div className="segmented admin-tabs" role="tablist" aria-label="Series sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'mocks' && <MocksTab seriesId={series.id} />}
      {tab === 'codes' && <CodesTab series={series} />}
      {tab === 'students' && <StudentsTab seriesId={series.id} />}
      {tab === 'details' && <DetailsTab series={series} onSaved={setSeries} />}
    </Page>
  )
}

function MocksTab({ seriesId }) {
  const [mocks, setMocks] = useState(null)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchSeriesMocks(seriesId).then((m) => { setMocks(m); setTitle(`Mock ${m.length + 1}`) }).catch((e) => { setMocks([]); setError(e.message) })
  }, [seriesId])

  const create = async (e) => {
    e.preventDefault()
    if (title.trim().length < 2 || busy) return
    setBusy(true)
    setError('')
    try {
      const m = await createMock(seriesId, title)
      navigate(`/coach/mocks/${m.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      <form className="card coach-inline-form" onSubmit={create}>
        <label className="field">
          <span>New mock</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Mock 1" />
        </label>
        <button type="submit" className="btn primary" disabled={busy || title.trim().length < 2}><Plus size={15} /> {busy ? 'Creating…' : 'Create mock'}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {mocks === null && <SkeletonCards count={2} height={72} />}
      {mocks && mocks.length === 0 && (
        <EmptyState icon={ClipboardList} title="No mocks yet">Create a mock, add its sections and questions, then publish it. Students with a code see published mocks only.</EmptyState>
      )}
      {mocks && mocks.length > 0 && (
        <ul className="coach-list">
          {mocks.map((m) => (
            <li key={m.id}>
              <a className="card coach-row" {...linkProps(`/coach/mocks/${m.id}`)}>
                <span className="coach-row-main">
                  <b>{m.title}</b>
                  <span className="muted small">
                    {m.questionCount} questions · {m.totalSec ? formatMinutes(m.totalSec) : 'no time set'}
                    {m.status === 'published' ? ` · ${m.attemptCount} attempt${m.attemptCount === 1 ? '' : 's'}` : ''}
                  </span>
                </span>
                <span className={`pill ${m.status === 'published' ? 'tone-great' : 'tone-mid'}`}>{m.status === 'published' ? 'Published' : 'Draft'}</span>
                <ChevronRight size={18} className="chev" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function CodesTab({ series }) {
  const [codes, setCodes] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ count: 10, maxUses: 1, expires: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('unused')

  const load = useCallback(() => {
    fetchCodes(series.id).then(setCodes).catch((e) => { setCodes([]); setError(e.message) })
  }, [series.id])
  useEffect(() => { load() }, [load])

  const make = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const made = await generateCodes(series.id, {
        count: Number(form.count),
        maxUses: Number(form.maxUses),
        // End of the chosen day, India time.
        expiresAt: form.expires ? new Date(`${form.expires}T23:59:59+05:30`).toISOString() : null,
        note: form.note,
      })
      setNotice(`Made ${made.length} code${made.length === 1 ? '' : 's'}.`)
      setFilter('unused')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const isUsable = (c) => !c.revoked && c.used_count < c.max_uses && (!c.expires_at || new Date(c.expires_at) > new Date())
  const shown = (codes || []).filter((c) => (filter === 'unused' ? isUsable(c) : true))

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(`Copied ${what}.`)
    } catch {
      setError('Couldn’t copy — select the code and copy it by hand.')
    }
  }

  const exportCsv = () => {
    const rows = [['code', 'note', 'uses', 'max_uses', 'expires', 'status'], ...shown.map((c) => [
      c.code, c.note || '', c.used_count, c.max_uses, c.expires_at ? formatDateTime(c.expires_at) : '', c.revoked ? 'revoked' : isUsable(c) ? 'active' : 'used up / expired',
    ])]
    downloadCsv(`${series.title.replace(/[^\w-]+/g, '_')}-codes.csv`, toCsv(rows))
  }

  const toggleRevoke = async (c) => {
    try { await setCodeRevoked(c.id, !c.revoked); load() } catch (err) { setError(err.message) }
  }
  const remove = async (c) => {
    try { await deleteCode(c.id); load() } catch (err) { setError(err.message) }
  }

  return (
    <>
      <form className="card admin-form coach-form" onSubmit={make}>
        <h2 className="admin-card-title">Make access codes</h2>
        <p className="admin-hint">
          Hand a code to each student who paid you. A student types it in <b>Mock Tests</b> and the whole series unlocks for them.
          One code per student (1 use) keeps track of who joined; one shared batch code (e.g. 60 uses) is quicker.
        </p>
        <div className="coach-form-row">
          <label className="field"><span>How many codes</span><input type="number" min={1} max={500} value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} /></label>
          <label className="field"><span>Students per code</span><input type="number" min={1} max={10000} value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} /></label>
          <label className="field"><span>Valid till <em>(optional)</em></span><input type="date" value={form.expires} onChange={(e) => setForm((f) => ({ ...f, expires: e.target.value }))} /></label>
        </div>
        <label className="field"><span>Note <em>(optional: batch or student name, only you see it)</em></span><input value={form.note} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Morning batch" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && !error && <p className="admin-notice" role="status">{notice}</p>}
        <div className="admin-actions">
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Making…' : 'Make codes'}</button>
        </div>
      </form>

      <div className="admin-list-head">
        <div className="segmented small" role="radiogroup" aria-label="Which codes">
          <button type="button" role="radio" aria-checked={filter === 'unused'} className={filter === 'unused' ? 'active' : ''} onClick={() => setFilter('unused')}>Can still be used</button>
          <button type="button" role="radio" aria-checked={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All ({codes?.length ?? 0})</button>
        </div>
        {shown.length > 0 && (
          <span className="coach-list-actions">
            <button type="button" className="btn small" onClick={() => copy(shown.map((c) => c.code).join('\n'), `${shown.length} codes`)}><Copy size={14} /> Copy</button>
            <button type="button" className="btn small" onClick={exportCsv}><Download size={14} /> CSV</button>
          </span>
        )}
      </div>
      {codes === null && <SkeletonCards count={1} height={120} />}
      {codes && shown.length === 0 && <p className="muted">{codes.length ? 'No usable codes left. Make some more above.' : 'No codes yet.'}</p>}
      {shown.length > 0 && (
        <div className="card coach-table-wrap">
          <table className="coach-table">
            <thead><tr><th>Code</th><th>Note</th><th>Used</th><th>Valid till</th><th /></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className={c.revoked ? 'revoked' : ''}>
                  <td><button type="button" className="coach-code" onClick={() => copy(c.code, c.code)} title="Copy">{c.code}</button></td>
                  <td>{c.note || <span className="muted">—</span>}</td>
                  <td>{c.used_count}/{c.max_uses}</td>
                  <td>{c.expires_at ? formatDateTime(c.expires_at) : <span className="muted">—</span>}</td>
                  <td className="coach-table-actions">
                    <button type="button" className="btn small ghost" onClick={() => toggleRevoke(c)}>{c.revoked ? <><Undo2 size={13} /> Restore</> : 'Revoke'}</button>
                    {c.used_count === 0 && (
                      <button type="button" className="icon-btn danger" aria-label={`Delete code ${c.code}`} onClick={() => remove(c)}><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// How a student without a code joined.
const SOURCE_LABEL = { free: 'Joined free', purchase: 'Bought online', manual: 'Added by Fedge' }

function StudentsTab({ seriesId }) {
  const [students, setStudents] = useState(null)
  const [error, setError] = useState('')
  const [toRemove, setToRemove] = useState(null)

  const load = useCallback(() => {
    fetchSeriesStudents(seriesId).then(setStudents).catch((e) => { setStudents([]); setError(e.message) })
  }, [seriesId])
  useEffect(() => { load() }, [load])

  const confirmRemove = async () => {
    const s = toRemove
    setToRemove(null)
    try { await removeStudent(seriesId, s.user_id); load() } catch (e) { setError(e.message) }
  }

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      {students === null && <SkeletonCards count={1} height={120} />}
      {students && students.length === 0 && <p className="muted">No students yet. They appear here once they unlock the series with one of your codes.</p>}
      {students && students.length > 0 && (
        <>
          <p className="muted small">{students.length} student{students.length === 1 ? '' : 's'}</p>
          <div className="card coach-table-wrap">
            <table className="coach-table">
              <thead><tr><th>Student</th><th>Joined</th><th>Code / how</th><th>Mocks done</th><th /></tr></thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.user_id}>
                    <td><b>{s.name}</b><br /><span className="muted small">{s.email}</span></td>
                    <td>{formatDateTime(s.enrolled_at)}</td>
                    <td>{s.code || SOURCE_LABEL[s.source] || '—'}{s.code_note ? <><br /><span className="muted small">{s.code_note}</span></> : null}</td>
                    <td>{s.mocks_done}</td>
                    <td className="coach-table-actions">
                      <button type="button" className="icon-btn danger" aria-label={`Remove ${s.name}`} onClick={() => setToRemove(s)}><UserMinus size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Modal
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        tone="danger"
        title={`Remove ${toRemove?.name}?`}
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setToRemove(null)}>Cancel</button>
            <button type="button" className="btn danger-solid" onClick={confirmRemove}>Remove</button>
          </>
        )}
      >
        <p>They lose access to this series. Their past results stay in your rankings. Their code isn&apos;t reusable unless it has uses left.</p>
      </Modal>
    </>
  )
}

function DetailsTab({ series, onSaved }) {
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const remove = async () => {
    try {
      await deleteSeries(series.id)
      navigate('/coach', { replace: true })
    } catch (e) {
      setError(e.message)
      setConfirm(false)
    }
  }

  return (
    <>
      <SeriesForm
        key={series.id}
        initial={series}
        commissionPct={series.coachings?.commission_pct}
        submitLabel="Save changes"
        onSave={async (f) => { onSaved({ ...series, ...(await updateSeries(series.id, f)) }); setNotice('Saved.') }}
      />
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card coach-danger">
        <div>
          <h3>Delete this test series</h3>
          <p className="muted small">Deletes every mock in it, every code, and all students&apos; results. Students lose access straight away.</p>
        </div>
        <button type="button" className="btn danger" onClick={() => setConfirm(true)}><Trash2 size={15} /> Delete</button>
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        title={`Delete “${series.title}”?`}
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
            <button type="button" className="btn danger-solid" onClick={remove}>Delete forever</button>
          </>
        )}
      >
        <p>This can&apos;t be undone.</p>
      </Modal>
    </>
  )
}
