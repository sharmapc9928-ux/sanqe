import { useEffect, useState } from 'react'
import { useApp } from '../lib/appContext'
import { navigate } from '../lib/router'
import { readStore, userKey, writeStore } from '../lib/storage'
import { displayName } from '../lib/format'
import { EXAMS, getPrompt } from '../lib/descriptive'
import { CandidatePhoto } from '../components/ExamChrome'

const INSTRUCTIONS = {
  ibps_po: (p) => [
    <>The test has <b>2 questions</b> — Essay and Comprehension — worth a combined <b>25 marks</b>.</>,
    <>A single <b>30-minute</b> timer runs for the whole test. Move between the two questions freely.</>,
    <>Essay: write <b>{p.word_limit_min}–{p.word_limit_max} words</b> on the topic given.</>,
    <>Comprehension: answer each sub-question in your <b>own words</b> — copied sentences lose marks.</>,
  ],
  sbi_po: (p) => [
    <>The test has <b>2 questions</b> — a Letter and an Essay — worth a combined <b>50 marks</b>.</>,
    <>A single <b>30-minute</b> timer runs for the whole test. Move between the two questions freely.</>,
    <>Letter: follow the correct format (address, date, subject, salutation, body, closing) in about <b>{p.letter_word_min || 150}–{p.letter_word_max || 200} words</b>.</>,
    <>Essay: write about <b>{p.word_limit_min}–{p.word_limit_max} words</b> on the topic given.</>,
  ],
}

export default function MockInstructions({ params }) {
  const { user } = useApp()
  const exam = EXAMS[params.exam]
  const mockNumber = Number(params.mock)
  const [prompt, setPrompt] = useState(null)
  const [error, setError] = useState('')
  const [ack, setAck] = useState(false)
  const [step, setStep] = useState(1) // 1 = General Instructions, 2 = declaration
  const nameKey = userKey(user.id, 'candidate-name')
  const [name, setName] = useState(() => readStore(nameKey, '') || displayName(user))
  const inProgress = exam ? !!readStore(userKey(user.id, `desc:${exam.key}:${mockNumber}`), null) : false

  useEffect(() => {
    if (!exam || !Number.isInteger(mockNumber)) {
      navigate('/mocks', { replace: true })
      return undefined
    }
    let cancelled = false
    getPrompt(exam.key, mockNumber)
      .then((p) => { if (!cancelled) setPrompt(p) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [exam, mockNumber])

  if (!exam) return null

  const begin = () => {
    writeStore(nameKey, name.trim())
    navigate(`/mocks/${exam.key}/${mockNumber}/test`)
  }

  return (
    <div className="exam-native-shell">
      <div className="exam-native-exit-bar">
        <button type="button" className="exam-native-exit" onClick={() => navigate(`/mocks/${exam.key}`)}>← Exit practice mode</button>
      </div>
      <div className="exam-native-topbar">
        <div className="exam-native-brand">{exam.title}</div>
        <span className="exam-native-candidate">Mock {mockNumber}</span>
      </div>
      <div className="exam-native-body">
        <div className="exam-native-panel">
          <h1 className="exam-native-panel-title">{step === 1 ? 'General Instructions' : 'Declaration'}</h1>
          {error && <p className="dres-error">{error}</p>}
          {!prompt && !error && <p>Loading…</p>}
          {prompt && step === 1 && (
            <>
              <ol className="exam-instr-list">
                {INSTRUCTIONS[exam.key](prompt).map((item, i) => <li key={i}>{item}</li>)}
                <li>The countdown timer at the top right shows the time left. When it reaches <b>00:00</b> the test submits itself.</li>
                <li>Use <b>Save &amp; Next</b> to move between the questions, and <b>Clear Response</b> to empty the current answer box.</li>
                <li>You can <b>Pause</b> the test for up to 10 minutes in total. The clock stops and the questions are hidden while it is paused.</li>
                <li>Copy, paste and right-click are disabled in the answer boxes, as in the real exam.</li>
                <li>Your answers are saved as you type. If you leave, you can resume — but <b>the clock keeps running</b>.</li>
                <li>After submitting you can&apos;t edit your answers.</li>
              </ol>
              <div className="exam-instr-actions">
                <span />
                <button type="button" className="exam-native-btn save" onClick={() => setStep(2)}>NEXT &gt;</button>
              </div>
            </>
          )}
          {prompt && step === 2 && (
            <>
              <div className="cm-profile">
                <CandidatePhoto size="lg" />
                <div className="exam-native-input-row" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="candidate-name">Candidate name</label>
                  <input
                    id="candidate-name"
                    className="exam-native-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                  />
                </div>
              </div>
              <label className="exam-native-checkbox-row">
                <input type="checkbox" checked={ack || inProgress} onChange={(e) => setAck(e.target.checked)} disabled={inProgress} />
                <span>I have read and understood the instructions given above. I agree to follow them during the test.</span>
              </label>
              <div className="exam-instr-actions">
                <button type="button" className="exam-native-btn clear" onClick={() => setStep(1)}>&lt; PREVIOUS</button>
                <button
                  type="button"
                  className="exam-native-btn start"
                  disabled={(!ack && !inProgress) || !name.trim()}
                  onClick={begin}
                >
                  {inProgress ? 'RESUME TEST' : 'I AM READY TO BEGIN'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
