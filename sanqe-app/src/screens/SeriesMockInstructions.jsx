import { useEffect, useState } from 'react'
import { useApp } from '../lib/appContext'
import { navigate } from '../lib/router'
import { readStore, userKey, writeStore } from '../lib/storage'
import { displayName } from '../lib/format'
import { fetchSeries, formatMarks, formatMinutes } from '../lib/coaching'
import { CandidatePhoto, GeneralInstructions } from '../components/ExamChrome'

// Instructions before a coaching mock, in the same exam-window look as the
// test itself.
export default function SeriesMockInstructions({ params }) {
  const { user } = useApp()
  const [series, setSeries] = useState(null)
  const [error, setError] = useState('')
  const [ack, setAck] = useState(false)
  const [step, setStep] = useState(1) // 1 sign in, 2 general, 3 pattern + declaration, 4 group instructions (sectional)
  const nameKey = userKey(user.id, 'candidate-name')
  const [name, setName] = useState(() => readStore(nameKey, '') || displayName(user))
  const back = `/series/${params.series}`

  useEffect(() => {
    let cancelled = false
    fetchSeries(params.series)
      .then((s) => { if (!cancelled) setSeries(s) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [params.series])

  const mock = series?.mocks.find((m) => m.id === params.mock)
  const attempt = mock?.attempt
  const inProgress = !!attempt && !attempt.submitted && !attempt.expired

  useEffect(() => {
    if (!series) return
    if (!mock) navigate(back, { replace: true })
    else if (attempt && (attempt.submitted || attempt.expired)) navigate(`${back}/${mock.id}/result`, { replace: true })
    else if (mock.locked) navigate('/unlock', { replace: true })
  }, [series, mock, attempt, back])

  const begin = () => {
    writeStore(nameKey, name.trim())
    navigate(`${back}/${mock.id}/test`)
  }

  const questions = mock ? mock.sections.reduce((n, s) => n + Number(s.questions || 0), 0) : 0
  const negative = Number(mock?.negative_mark || 0)

  const sectional = !!mock && mock.sectional_timing && mock.sections.length > 1
  const secs = mock?.sections || []
  const fmt = (n) => formatMarks(n)
  const totalMarks = secs.reduce((n, s) => n + Number(s.questions) * Number(s.marks), 0)
  const first = secs[0]

  const shell = (children, footer) => (
    <div className="ex-i-screen">
      <div className="ex-i-hdr">{mock?.title || series?.coaching?.name || 'Mock test'}</div>
      <div className="ex-i-wrap">
        <div className="ex-i-main">{children}</div>
        {step > 1 && (
          <div className="ex-i-side">
            <div className="ex-i-photo"><CandidatePhoto size="lg" /></div>
            <div className="ex-i-nm">{name || 'Candidate Name'}</div>
          </div>
        )}
      </div>
      <div className="ex-i-foot">{footer}</div>
    </div>
  )

  if (!mock) {
    return shell(
      error ? <p className="dres-error">{error}</p> : <p>Loading…</p>,
      <button type="button" className="ex-btn" onClick={() => navigate(back)}>Back to test series</button>,
    )
  }

  if (step === 1) {
    return (
      <div className="ex-login">
        <div className="ex-l-top"><span><b>System Name :</b> C001</span><span>Mock Examination</span></div>
        <div className="ex-l-card">
          <div className="ex-l-left">
            <div className="ex-i-photo"><CandidatePhoto size="lg" /></div>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Candidate name" />
            <div className="ex-l-subj"><b>Subject :</b> {mock.title}</div>
            <span className="ex-l-note">Tap the name above to change how it appears on your test.</span>
          </div>
          <div className="ex-l-right">
            <h2>Sign in to Continue</h2>
            <label htmlFor="ex-uname">Username</label>
            <input id="ex-uname" value="MOCK2026" readOnly />
            <label htmlFor="ex-pword">Password</label>
            <input id="ex-pword" type="password" value="mock2026" readOnly />
            <button type="button" className="ex-btn primary" disabled={!name.trim()} onClick={() => setStep(2)}>Sign in</button>
            <button type="button" className="ex-btn ex-l-back" onClick={() => navigate(back)}>Back to test series</button>
          </div>
        </div>
        <div className="ex-l-foot">This is a practice mock. It is not affiliated with IBPS or TCS iON.</div>
      </div>
    )
  }

  if (step === 2) {
    return shell(
      <GeneralInstructions
        totalMinutes={Math.round(mock.total_sec / 60)}
        questions={questions}
        sectional={sectional}
        sections={secs.length > 1}
      />,
      <>
        <button type="button" className="ex-btn" onClick={() => setStep(1)}>&lt; Previous</button>
        <button type="button" className="ex-btn primary" onClick={() => setStep(3)}>Next &gt;</button>
      </>,
    )
  }

  if (step === 3) {
    return shell(
      <div className="ex-instr">
        <h3>Other Important Instructions</h3>
        <h4>Examination pattern of this mock</h4>
        <table className="ex-pattern">
          <thead>
            <tr><th>Section</th><th>Questions</th><th>Max Marks</th><th>Marks / Q</th><th>Negative / Q</th><th>Time</th></tr>
          </thead>
          <tbody>
            {secs.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{s.questions}</td>
                <td>{fmt(Number(s.questions) * Number(s.marks))}</td>
                <td>{fmt(s.marks)}</td>
                <td>{fmt(negative * Number(s.marks))}</td>
                <td>{mock.sectional_timing ? formatMinutes(s.duration_sec) : '—'}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>Total</td><td>{questions}</td><td>{fmt(totalMarks)}</td><td>-</td><td>-</td><td>{Math.round(mock.total_sec / 60)} min</td>
            </tr>
          </tbody>
        </table>
        <ol>
          {sectional && <li>Each section is <b>separately timed</b>. When the time of a section is over, the section ends by itself and you move to the next one. You cannot go back to a section that has ended.</li>}
          <li>
            Each question has up to five options and only one is correct.{' '}
            {negative > 0
              ? <>For every wrong answer, <b>{fmt(negative)}</b> of the marks assigned to that question will be deducted as penalty. There is no penalty for a question you leave unanswered.</>
              : <>There is no negative marking.</>}
          </li>
          <li>Only the answers you have saved (<b>Save &amp; Next</b>, or <b>Mark for Review &amp; Next</b> after choosing an option) are evaluated.</li>
          <li>You get <b>one attempt</b>; your rank is worked out against everyone {series.is_open ? '' : 'in your coaching '}who takes it.</li>
        </ol>
        {mock.instructions && (
          <>
            <h4>{series.is_open ? 'About this mock' : 'From your coaching'}</h4>
            <p className="cm-coach-note">{mock.instructions}</p>
          </>
        )}
        <div className="ex-lang">Choose your default language: <select aria-label="Default language" defaultValue="en"><option value="en">English</option></select></div>
        <div className="ex-lang-note">Please note all questions will appear in your default language.</div>
        <label className="ex-decl">
          <input type="checkbox" checked={ack || inProgress} onChange={(e) => setAck(e.target.checked)} disabled={inProgress} />
          <span>I have read and understood the instructions and agree to adhere to them.</span>
        </label>
      </div>,
      <>
        <button type="button" className="ex-btn" onClick={() => setStep(2)}>&lt; Previous</button>
        {sectional
          ? <button type="button" className="ex-btn primary" disabled={!ack && !inProgress} onClick={() => setStep(4)}>Next &gt;</button>
          : <button type="button" className="ex-btn primary" disabled={!ack && !inProgress} onClick={begin}>{inProgress ? 'Resume test' : 'I am ready to begin'}</button>}
      </>,
    )
  }

  return shell(
    <div className="ex-instr">
      <h3>Section 1 of {secs.length}: {first.name}</h3>
      <h4>Group Instructions:</h4>
      <ol>
        <li>This section contains <b>{first.questions} questions</b>. The time allotted for this section is <b>{formatMinutes(first.duration_sec)}</b>.</li>
        <li>Each correct answer carries <b>{fmt(first.marks)}</b> mark(s).{' '}
          {negative > 0 ? <>For each wrong answer <b>{fmt(negative * Number(first.marks))}</b> mark(s) will be deducted. </> : null}
          There is no negative marking for unanswered questions.</li>
        <li>The timer for this section starts when you click <b>Proceed</b>. The following sections open one after another as each section&apos;s time ends.</li>
        <li>When the time for a section is over, you move to the next section automatically. You cannot return to a section that has ended.</li>
      </ol>
    </div>,
    <>
      <button type="button" className="ex-btn" onClick={() => setStep(3)}>&lt; Previous</button>
      <button type="button" className="ex-btn primary" onClick={begin}>{inProgress ? 'Resume test' : 'Proceed'}</button>
    </>,
  )
}
