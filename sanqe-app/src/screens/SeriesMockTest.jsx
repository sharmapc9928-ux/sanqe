import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, LayoutGrid, X } from 'lucide-react'
import { PassageText, QuestionImage, optionKeys } from '../components/Question'
import { RichText } from '../components/RichText'
import { useApp } from '../lib/appContext'
import { navigate, useNavigationBlocker } from '../lib/router'
import { readStore, userKey, writeStore } from '../lib/storage'
import { useCountdown } from '../lib/useCountdown'
import { useExamLock } from '../lib/useExamLock'
import { displayName, formatTime } from '../lib/format'
import { formatMarks, pauseMock, resumeMock, saveMockProgress, startMock, submitMock } from '../lib/coaching'
import { CandidatePhoto, PALETTE_LEGEND, PauseButton, PauseOverlay, PaletteSymbol } from '../components/ExamChrome'

// Full-length coaching mock in an IBPS / TCS iON style window: section tabs,
// question palette, Mark for Review, sectional clocks. The server decides
// timing and score; this screen keeps a local copy of the answers (instant,
// survives a refresh) and autosaves them to the server.

const SERVER_SAVE_MS = 15000
const LOW_TIME_SEC = 300

const STATUS_LABELS = {
  answered: 'Answered',
  'not-answered': 'Not answered',
  'not-visited': 'Not visited',
  marked: 'Marked for review',
  'answered-marked': 'Answered & marked',
}

export default function SeriesMockTest({ params }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const seriesPath = `/series/${params.series}`
  const resultPath = `${seriesPath}/${params.mock}/result`

  useEffect(() => {
    let cancelled = false
    startMock(params.mock)
      .then((d) => {
        if (cancelled) return
        if (d.submitted) navigate(resultPath, { replace: true, force: true })
        else setData({ ...d, receivedAt: Date.now() })
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [params.mock, resultPath])

  if (!data) {
    return (
      <div className="exam-native-shell">
        <div className="exam-native-topbar"><div className="exam-native-brand">Mock test</div></div>
        <div className="exam-native-body">
          <div className="exam-native-panel exam-native-result">
            {error ? (
              <>
                <h1 className="exam-native-panel-title">Couldn&apos;t open this mock</h1>
                <p>{error}</p>
                <button type="button" className="exam-native-btn start" onClick={() => navigate(seriesPath)}>Back to test series</button>
              </>
            ) : <p>Loading test…</p>}
          </div>
        </div>
      </div>
    )
  }
  return <Runner key={data.attempt.id} data={data} seriesPath={seriesPath} resultPath={resultPath} />
}

function Runner({ data, seriesPath, resultPath }) {
  const { user } = useApp()
  const { mock, sections, attempt } = data
  const candidateName = readStore(userKey(user.id, 'candidate-name'), '') || displayName(user)
  const storeKey = userKey(user.id, `cmock:${attempt.id}`)
  const sectional = mock.sectional_timing && sections.length > 1

  // Server times in this device's clock. Each section owns a fixed slot from
  // the start: [from, to). That's also how the server checks late answers.
  // Pausing moves started_at on the server, so the clock basis is state.
  const [sync, setSync] = useState({ serverNow: data.server_now, receivedAt: data.receivedAt, startedAt: attempt.started_at })
  const timing = useMemo(() => {
    const offset = Date.parse(sync.serverNow) - sync.receivedAt
    const start = Date.parse(sync.startedAt) - offset
    let cum = 0
    const slots = sections.map((s) => {
      const from = start + cum * 1000
      cum += s.duration_sec
      return { from, to: start + cum * 1000 }
    })
    return { endAt: start + mock.total_sec * 1000, slots }
  }, [sync, sections, mock.total_sec])
  const sectionAt = useCallback((t) => timing.slots.findIndex((s) => t < s.to), [timing]) // -1 = all over

  // ---- state (resumed from this device, else from the server) ----
  // Opened while a pause was still on: the clock is frozen at the moment it began.
  const [initialPausedAt] = useState(() => (
    attempt.paused_at ? Date.parse(attempt.paused_at) - (Date.parse(data.server_now) - data.receivedAt) : null
  ))
  const [initial] = useState(() => {
    const local = readStore(storeKey, null)
    if (local && local.answers && typeof local.answers === 'object') return local
    return { answers: attempt.answers || {}, marked: attempt.progress?.marked || [], visited: attempt.progress?.visited || [], cur: null }
  })
  const [answers, setAnswers] = useState(initial.answers)
  const [marked, setMarked] = useState(() => new Set(initial.marked))
  const [visited, setVisited] = useState(() => new Set(initial.visited))
  const [cur, setCur] = useState(() => {
    const si = sectional ? Math.max(0, sectionAt(initialPausedAt ?? Date.now())) : Math.min(initial.cur?.si ?? 0, sections.length - 1)
    const qi = initial.cur?.si === si ? Math.min(initial.cur.qi ?? 0, sections[si].questions.length - 1) : 0
    return { si, qi }
  })
  const [phase, setPhase] = useState('testing') // testing | submitting | error
  const [notice, setNotice] = useState(initial.cur ? 'Resumed your test. The clock kept running while you were away.' : '')
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [exitPrompt, setExitPrompt] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [pending, setPending] = useState({}) // chosen but not saved yet: { [questionId]: key | null }
  const [sectionDone, setSectionDone] = useState(null) // { from, to } while the Section Summary is up
  const qrightRef = useRef(null)
  const passageRef = useRef(null)
  const mainRef = useRef(null)
  const [submitError, setSubmitError] = useState('')
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [pause, setPause] = useState(() => (
    attempt.paused_at ? { at: initialPausedAt, endsAt: Date.now() + (attempt.pause_left_sec ?? 0) * 1000 } : null
  ))
  const [pauseBudget, setPauseBudget] = useState(attempt.pause_left_sec ?? 600)
  const [pauseBusy, setPauseBusy] = useState(false)
  const resumingRef = useRef(false)

  const section = sections[cur.si]
  const q = section.questions[cur.qi]

  useEffect(() => {
    setVisited((v) => (v.has(q.id) ? v : new Set(v).add(q.id)))
  }, [q.id])

  useEffect(() => { qrightRef.current?.scrollTo({ top: 0 }) }, [q.id])

  // Local copy on every change.
  useEffect(() => {
    writeStore(storeKey, { answers, marked: [...marked], visited: [...visited], cur })
  }, [storeKey, answers, marked, visited, cur])

  // ---- server autosave ----
  const latest = useRef({ answers, marked, visited })
  latest.current = { answers, marked, visited }
  const dirtyRef = useRef(false)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const leaveToResult = useCallback(() => {
    writeStore(storeKey, null)
    navigate(resultPath, { replace: true, force: true })
  }, [storeKey, resultPath])

  const flush = useCallback(async () => {
    if (!dirtyRef.current || phaseRef.current !== 'testing') return
    dirtyRef.current = false
    const { answers: a, marked: m, visited: v } = latest.current
    try {
      const r = await saveMockProgress(attempt.id, a, { marked: [...m], visited: [...v] })
      if (r?.submitted) leaveToResult()
    } catch {
      dirtyRef.current = true // try again on the next tick
    }
  }, [attempt.id, leaveToResult])

  useEffect(() => {
    const id = setInterval(flush, SERVER_SAVE_MS)
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide) }
  }, [flush])

  // ---- submit ----
  const submittingRef = useRef(false)
  const submit = useCallback(async (auto) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setConfirmSubmit(false)
    setAutoSubmitted(auto)
    setSubmitError('')
    setPhase('submitting')
    try {
      await submitMock(attempt.id, latest.current.answers)
      leaveToResult()
    } catch (e) {
      submittingRef.current = false
      setSubmitError(e.message)
      setPhase('error')
    }
  }, [attempt.id, leaveToResult])

  // ---- clock ----
  const clockEnd = sectional ? timing.slots[cur.si].to : timing.endAt
  const pauseTest = async () => {
    if (pauseBusy || pause || phaseRef.current !== 'testing') return
    setPauseBusy(true)
    dirtyRef.current = true
    try {
      await flush()
      const r = await pauseMock(attempt.id)
      if (r?.submitted) { leaveToResult(); return }
      setPause({ at: Date.now(), endsAt: Date.now() + r.pause_left_sec * 1000 })
      setPauseBudget(r.pause_left_sec)
    } catch (e) {
      setNotice(e.message || 'Could not pause the test.')
    } finally {
      setPauseBusy(false)
    }
  }
  const resumeTest = useCallback(async () => {
    if (resumingRef.current) return
    resumingRef.current = true
    setPauseBusy(true)
    try {
      const r = await resumeMock(attempt.id)
      if (r?.submitted) { leaveToResult(); return }
      setSync({ serverNow: r.server_now, receivedAt: Date.now(), startedAt: r.started_at })
      setPauseBudget(r.pause_left_sec)
      setPause(null)
    } catch (e) {
      setNotice(e.message || 'Could not resume. Try again.')
    } finally {
      resumingRef.current = false
      setPauseBusy(false)
    }
  }, [attempt.id, leaveToResult])
  const pauseLeft = useCountdown(pause ? pause.endsAt : null, resumeTest)
  const onExpire = () => {
    if (sectional) {
      const next = sectionAt(Date.now())
      if (next > cur.si) {
        dirtyRef.current = true
        flush()
        setPending({})
        setCur({ si: next, qi: 0 })
        setPaletteOpen(false)
        setSectionDone({ from: cur.si, to: next })
        return
      }
    }
    submit(true)
  }
  const left = useCountdown(phase === 'testing' && !pause ? clockEnd : null, onExpire)
  const shownLeft = pause ? Math.max(0, Math.ceil((clockEnd - pause.at) / 1000)) : (left ?? Math.max(0, Math.ceil((clockEnd - Date.now()) / 1000)))

  useEffect(() => {
    if (!notice) return undefined
    const t = setTimeout(() => setNotice(''), 7000)
    return () => clearTimeout(t)
  }, [notice])

  useExamLock(phase === 'testing')
  useNavigationBlocker(phase === 'testing' ? (proceed) => setExitPrompt(() => proceed) : null)

  // ---- actions ----
  // Leaving a question without saving drops what was chosen on it, as in the exam.
  const go = (si, qi) => { setPending({}); setCur({ si, qi }); setPaletteOpen(false) }
  const next = () => {
    if (cur.qi < section.questions.length - 1) go(cur.si, cur.qi + 1)
    else if (!sectional && cur.si < sections.length - 1) go(cur.si + 1, 0)
    else {
      setPending({})
      setNotice(sectional ? 'Last question of this section. Review your answers — the next section opens when this one’s time ends.' : 'That was the last question. Submit when you’re ready.')
    }
  }
  const picked = q.id in pending ? pending[q.id] : (answers[q.id] ?? null)
  const choose = (k) => setPending((p) => ({ ...p, [q.id]: picked === k ? null : k }))
  const commit = () => {
    if (!(q.id in pending)) return
    const v = pending[q.id]
    setAnswers((a) => {
      const n = { ...a }
      if (v) n[q.id] = v; else delete n[q.id]
      return n
    })
    dirtyRef.current = true
  }
  const clearResponse = () => {
    setPending((p) => { const n = { ...p }; delete n[q.id]; return n })
    setAnswers((a) => { const n = { ...a }; delete n[q.id]; return n })
    dirtyRef.current = true
  }
  const setMark = (on) => {
    setMarked((m) => {
      if (m.has(q.id) === on) return m
      const n = new Set(m)
      if (on) n.add(q.id); else n.delete(q.id)
      return n
    })
    dirtyRef.current = true
  }
  const saveNext = () => { commit(); setMark(false); next() }
  const markNext = () => { commit(); setMark(true); next() }
  const scrollQ = (toBottom) => {
    const panes = [qrightRef.current, passageRef.current, mainRef.current].filter((el) => el && el.scrollHeight > el.clientHeight + 2)
    panes.forEach((el) => el.scrollTo({ top: toBottom ? el.scrollHeight : 0, behavior: 'smooth' }))
  }

  const statusOf = (qq) => {
    const ans = !!answers[qq.id]
    const mk = marked.has(qq.id)
    if (ans && mk) return 'answered-marked'
    if (mk) return 'marked'
    if (ans) return 'answered'
    if (visited.has(qq.id)) return 'not-answered'
    return 'not-visited'
  }
  const countIn = (qs) => {
    const c = { answered: 0, 'not-answered': 0, 'not-visited': 0, marked: 0, 'answered-marked': 0 }
    qs.forEach((qq) => { c[statusOf(qq)] += 1 })
    return c
  }
  const sectionCounts = countIn(section.questions)
  const allCounts = countIn(sections.flatMap((s) => s.questions))
  const answeredTotal = allCounts.answered + allCounts['answered-marked']
  const negative = Number(mock.negative_mark) * Number(section.marks)

  if (phase !== 'testing') {
    return (
      <div className="exam-native-shell">
        <div className="exam-native-topbar">
          <div className="exam-native-brand">{mock.title}</div>
          <span className="exam-native-candidate">Candidate: {candidateName}</span>
        </div>
        <div className="exam-native-body">
          <div className="exam-native-panel exam-native-result">
            {phase === 'submitting' ? (
              <>
                <h1 className="exam-native-panel-title">{autoSubmitted ? 'Time up — submitting your test' : 'Submitting your test…'}</h1>
                <p>Working out your score and rank.</p>
              </>
            ) : (
              <>
                <h1 className="exam-native-panel-title">Couldn&apos;t submit</h1>
                <p className="dres-error">{submitError}</p>
                <p>Your answers are saved on this device. Try again — if time has run out, your saved answers are submitted for you anyway.</p>
                <div className="exam-native-modal-actions center">
                  <button type="button" className="exam-native-btn clear" onClick={() => navigate(seriesPath, { force: true })}>Back to test series</button>
                  <button type="button" className="exam-native-btn start" onClick={() => submit(autoSubmitted)}>Try again</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const tabTip = (si) => {
    const c = countIn(sections[si].questions)
    return `Answered: ${c.answered} | Not Answered: ${c['not-answered']} | Marked for Review: ${c.marked} | Answered & Marked for Review: ${c['answered-marked']} | Not Visited: ${c['not-visited']}`
  }
  const summaryTable = (list) => (
    <table className="ex-sum">
      <thead>
        <tr><th>Section Name</th><th>No. of Questions</th><th>Answered</th><th>Not Answered</th><th>Marked for Review</th><th>Answered &amp; Marked for Review</th><th>Not Visited</th></tr>
      </thead>
      <tbody>
        {list.map((s) => {
          const c = countIn(s.questions)
          return (
            <tr key={s.id}>
              <td>{s.name}</td><td>{s.questions.length}</td><td>{c.answered}</td><td>{c['not-answered']}</td>
              <td>{c.marked}</td><td>{c['answered-marked']}</td><td>{c['not-visited']}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
  const hasPassage = !!(q.passage || q.image_url)
  const hasPrev = sectionDone ? sections[sectionDone.from] : null
  const hasNext = sectionDone ? sections[sectionDone.to] : null

  const palette = (
    <>
      <div className="ex-cand">
        <CandidatePhoto />
        <span className="ex-cand-name">{candidateName}</span>
        <button type="button" className="ex-palette-close icon-btn" aria-label="Close palette" onClick={() => setPaletteOpen(false)}><X size={16} /></button>
      </div>
      <div className="ex-legend">
        {PALETTE_LEGEND.map(({ key, label }) => (
          <div key={key} className={`ex-lg${key === 'answered-marked' ? ' wide' : ''}`}>
            <PaletteSymbol kind={key}>{sectionCounts[key]}</PaletteSymbol>
            <span>{label}</span>
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
            className={`cm-pbtn ${statusOf(qq)}${i === cur.qi ? ' current' : ''}`}
            onClick={() => go(cur.si, i)}
            aria-label={`Question ${i + 1}: ${STATUS_LABELS[statusOf(qq)]}`}
            aria-current={i === cur.qi ? 'true' : undefined}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="ex-sub-wrap">
        <button type="button" className="ex-btn primary" onClick={() => { setPaletteOpen(false); setConfirmSubmit(true) }}>Submit</button>
      </div>
    </>
  )

  return (
    <div className="ex-test">
      <div className="ex-hdr">
        <h1 className="ex-title">{mock.title}</h1>
        <button type="button" className="ex-link" onClick={() => setExitPrompt(() => () => navigate(seriesPath, { force: true }))}>Leave test</button>
      </div>

      <div className="ex-secrow">
        <span className="ex-seclabel">Sections</span>
        <div className="ex-tabs" role="tablist" aria-label="Sections">
          {sections.map((s, i) => {
            const locked = sectional && i !== cur.si
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === cur.si}
                className={`ex-tab${i === cur.si ? ' active' : ''}${sectional && i < cur.si ? ' done' : ''}`}
                disabled={locked}
                title={locked ? (i < cur.si ? 'This section has ended.' : 'This section is locked until the current section ends.') : tabTip(i)}
                onClick={() => go(i, 0)}
              >
                {s.name}<span className="ex-info" title={tabTip(i)} aria-hidden="true">i</span>
              </button>
            )
          })}
        </div>
        <div className="ex-clock">
          <PauseButton onClick={pauseTest} busy={pauseBusy} left={pauseBudget} />
          <div className={`ex-timer${shownLeft <= LOW_TIME_SEC ? ' warn' : ''}`} role="timer" aria-label={`Time left ${formatTime(shownLeft)}`}>
            Time Left : <b>{formatTime(shownLeft)}</b>
          </div>
        </div>
        <button type="button" className="ex-palette-toggle" onClick={() => setPaletteOpen(true)} aria-label="Open question palette">
          <LayoutGrid size={16} /> {cur.qi + 1}/{section.questions.length}
        </button>
      </div>

      <div className="ex-main" ref={mainRef}>
        <div className="ex-left">
          <div className="ex-qhead">
            <span className="ex-qt">Question Type: MCQ</span>
            <span>
              <span>Marks for correct answer: <b className="ok">{formatMarks(section.marks)}</b> | Negative Marks: <b className="bad">{formatMarks(negative)}</b></span>
              <span className="ex-view">&nbsp;&nbsp; View in <select aria-label="Language" defaultValue="en"><option value="en">English</option></select></span>
            </span>
          </div>
          <div className="ex-qno">Question No. {cur.qi + 1}</div>
          <div className="ex-qbody">
            {hasPassage && (
              <div className="ex-passage" ref={passageRef} key={`p-${q.passage || ''}-${q.image_url ? 1 : 0}`}>
                {q.passage && <PassageText text={q.passage} />}
                {q.image_url && <QuestionImage src={q.image_url} />}
              </div>
            )}
            <div className="ex-qright" ref={qrightRef} key={q.id}>
              <div className="ex-qtext"><RichText text={q.question} /></div>
              <div className="ex-opts" role="radiogroup" aria-label="Options">
                {optionKeys(q).map((k, i) => {
                  const on = picked === k
                  return (
                    <button key={k} type="button" role="radio" aria-checked={on} className={`ex-opt${on ? ' sel' : ''}`} onClick={() => choose(k)}>
                      <span className="ex-rad" aria-hidden="true" />
                      <span className="ex-no">{i + 1}.</span>
                      <span className="ex-opt-text"><RichText text={q[`option_${k}`]} /></span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="ex-scroll">
              <button type="button" onClick={() => scrollQ(false)} aria-label="Scroll to top"><ChevronUp size={16} /></button>
              <button type="button" onClick={() => scrollQ(true)} aria-label="Scroll to bottom"><ChevronDown size={16} /></button>
            </div>
          </div>
          {notice && (
            <div className="exam-native-notice" role="status">
              <span>{notice}</span>
              <button type="button" className="exam-native-notice-close" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
            </div>
          )}
          <div className="ex-bar">
            <div className="ex-grp">
              <button type="button" className="ex-btn" onClick={markNext}>Mark for Review &amp; Next</button>
              <button type="button" className="ex-btn" onClick={clearResponse} disabled={!picked && !answers[q.id]}>Clear Response</button>
            </div>
            <button type="button" className="ex-btn primary" onClick={saveNext}>Save &amp; Next</button>
          </div>
        </div>

        <button type="button" className="ex-collapse" onClick={() => setCollapsed((c) => !c)} title="Show / hide question palette" aria-label="Show or hide question palette">
          {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
        <aside className={`ex-right${paletteOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`} aria-label="Question palette">{palette}</aside>
        {paletteOpen && <div className="cm-palette-backdrop" onClick={() => setPaletteOpen(false)} />}
      </div>

      {pause && <PauseOverlay left={pauseLeft} onResume={resumeTest} busy={pauseBusy} />}

      {sectionDone && (
        <div className="ex-modal-bg">
          <div className="ex-modal wide" role="dialog" aria-modal="true" aria-labelledby="ex-sd-title">
            <div className="ex-mt" id="ex-sd-title">Section Summary</div>
            <div className="ex-mbody">
              <p>Time for <b>{hasPrev.name}</b> is over. Your saved responses have been submitted. You are now in the next section: <b>{hasNext.name}</b>.</p>
              {summaryTable([hasPrev])}
              <h4>Group Instructions:</h4>
              <ol>
                <li>This section contains <b>{hasNext.questions.length} questions</b>. The time allotted for this section is <b>{Math.round(hasNext.duration_sec / 60)} minutes</b>.</li>
                <li>Each correct answer carries <b>{formatMarks(hasNext.marks)}</b> mark(s). For each wrong answer <b>{formatMarks(Number(mock.negative_mark) * Number(hasNext.marks))}</b> mark(s) will be deducted. There is no negative marking for unanswered questions.</li>
                <li>The timer of this section is already running. You cannot return to the earlier section.</li>
              </ol>
            </div>
            <div className="ex-mfoot"><button type="button" className="ex-btn primary" onClick={() => setSectionDone(null)}>OK</button></div>
          </div>
        </div>
      )}

      {confirmSubmit && (
        <div className="ex-modal-bg" onClick={() => setConfirmSubmit(false)}>
          <div className="ex-modal wide" role="dialog" aria-modal="true" aria-labelledby="cm-submit-title" onClick={(e) => e.stopPropagation()}>
            <div className="ex-mt" id="cm-submit-title">{sections.length > 1 ? 'Exam Summary' : 'Section Summary'}</div>
            <div className="ex-mbody">
              {summaryTable(sections)}
              <p>
                {answeredTotal} answered in all. {sectional && cur.si < sections.length - 1
                  ? `Are you sure you want to submit? Submitting now ends the whole test — ${sections.slice(cur.si + 1).map((s) => s.name).join(', ')} won’t open.`
                  : 'Are you sure you want to submit the exam? You will not be able to change your answers after submitting.'}
              </p>
            </div>
            <div className="ex-mfoot">
              <button type="button" className="ex-btn" onClick={() => setConfirmSubmit(false)}>No</button>
              <button type="button" className="ex-btn primary" onClick={() => submit(false)}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {exitPrompt && (
        <div className="ex-modal-bg" onClick={() => setExitPrompt(null)}>
          <div className="ex-modal" role="dialog" aria-modal="true" aria-labelledby="cm-exit-title" onClick={(e) => e.stopPropagation()}>
            <div className="ex-mt" id="cm-exit-title">Leave this test?</div>
            <div className="ex-mbody">
              <p>Your saved answers are kept and you can resume — but the clock keeps running. If time runs out while you&apos;re away, your saved answers are submitted.</p>
            </div>
            <div className="ex-mfoot">
              <button type="button" className="ex-btn" onClick={() => setExitPrompt(null)}>Stay</button>
              <button
                type="button"
                className="ex-btn primary"
                onClick={async () => {
                  const goAway = exitPrompt
                  setExitPrompt(null)
                  dirtyRef.current = true
                  await flush()
                  goAway()
                }}
              >
                Save &amp; Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
