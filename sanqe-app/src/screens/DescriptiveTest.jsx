import { useCallback, useEffect, useRef, useState } from 'react'
import DescriptiveResult from '../components/DescriptiveResult'
import { useApp } from '../lib/appContext'
import { navigate, useNavigationBlocker } from '../lib/router'
import { readStore, userKey, writeStore } from '../lib/storage'
import { useCountdown } from '../lib/useCountdown'
import { useExamLock } from '../lib/useExamLock'
import { countWords, displayName, formatTime } from '../lib/format'
import { CandidatePhoto, PALETTE_LEGEND, PauseButton, PauseOverlay, PaletteSymbol } from '../components/ExamChrome'
import {
  EXAMS, deleteServerDraft, evaluateAttempt, getPrompt, loadServerDraft, saveServerDraft, submitAttempt,
} from '../lib/descriptive'

const PAUSE_CAP_SEC = 600
const LOW_TIME_SEC = 2 * 60
const SERVER_SAVE_MS = 12000

// Real exam software blocks copy/paste and the context menu in answer boxes.
const blockClipboard = (e) => e.preventDefault()
const clipboardGuards = { onCopy: blockClipboard, onPaste: blockClipboard, onCut: blockClipboard, onContextMenu: blockClipboard }

function wordStatus(count, min, max) {
  if (count === 0) return 'idle'
  if (count >= min && count <= max) return 'ok'
  const span = max - min
  if (count >= min - span * 0.15 && count <= max + span * 0.15) return 'warn'
  return 'bad'
}

function compStatus(count) {
  if (count === 0) return 'idle'
  if (count <= 80) return 'ok'
  if (count <= 100) return 'warn'
  return 'bad'
}

export default function DescriptiveTest({ params }) {
  const { user } = useApp()
  const exam = EXAMS[params.exam]
  const mockNumber = Number(params.mock)
  const [prompt, setPrompt] = useState(null)
  const [error, setError] = useState('')

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
  if (error || !prompt) {
    return (
      <div className="exam-native-shell">
        <div className="exam-native-topbar"><div className="exam-native-brand">{exam.title}</div></div>
        <div className="exam-native-body">
          <div className="exam-native-panel exam-native-result">
            {error ? (
              <>
                <h1 className="exam-native-panel-title">Couldn&apos;t load this mock</h1>
                <p>{error}</p>
                <button type="button" className="exam-native-btn start" onClick={() => navigate(`/mocks/${exam.key}`)}>Back to mock tests</button>
              </>
            ) : <p>Loading test…</p>}
          </div>
        </div>
      </div>
    )
  }
  return <TestRunner exam={exam} prompt={prompt} mockNumber={mockNumber} user={user} />
}

function TestRunner({ exam, prompt, mockNumber, user }) {
  const draftKey = userKey(user.id, `desc:${exam.key}:${mockNumber}`)
  const candidateName = readStore(userKey(user.id, 'candidate-name'), '') || displayName(user)
  const subQuestions = Array.isArray(prompt.sub_questions) ? prompt.sub_questions : []
  const tabs = exam.parts.map((p) => p.key) // ['essay','comprehension'] or ['letter','essay']
  const letterMin = prompt.letter_word_min || 150
  const letterMax = prompt.letter_word_max || 200

  // Resume from the local draft if there is one: same answers, same clock.
  const [initial] = useState(() => {
    const d = readStore(draftKey, null)
    if (d && typeof d.endAt === 'number') return { ...d, resumed: true }
    // Not written to storage here (initializers must stay pure); the
    // answers effect below saves it on the first commit.
    return {
      endAt: Date.now() + exam.durationSec * 1000,
      answers: { essay: '', letter: '', comprehension: subQuestions.map(() => '') },
      resumed: false,
    }
  })
  const [endAt, setEndAt] = useState(initial.endAt)
  // Pause: the clock stops; on resume endAt moves later by the time paused.
  // The budget is 10 minutes in total, like the coaching mocks.
  const [pausedAt, setPausedAt] = useState(typeof initial.pausedAt === 'number' ? initial.pausedAt : null)
  const [pauseUsedSec, setPauseUsedSec] = useState(Number(initial.pauseUsedSec) || 0)
  const pauseBudgetSec = Math.max(0, PAUSE_CAP_SEC - pauseUsedSec)
  const [answers, setAnswers] = useState(() => ({
    essay: initial.answers?.essay || '',
    letter: initial.answers?.letter || '',
    comprehension: subQuestions.map((_, i) => initial.answers?.comprehension?.[i] || ''),
  }))
  const answersRef = useRef(answers)
  answersRef.current = answers
  const [tab, setTab] = useState(tabs[0])
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([tabs[0]]))
  useEffect(() => { setVisitedTabs((v) => (v.has(tab) ? v : new Set(v).add(tab))) }, [tab])
  const [notice, setNotice] = useState(initial.resumed ? 'Resumed your saved answers. The clock kept running while you were away.' : '')
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [exitPrompt, setExitPrompt] = useState(null) // pending navigation, when leaving mid-test

  // A fresh start with no local copy: pick up a draft saved from another device.
  useEffect(() => {
    if (initial.resumed) return undefined
    let cancelled = false
    loadServerDraft(exam.key, mockNumber).then((d) => {
      if (cancelled || !d) return
      const hasText = (d.essay_answer || d.letter_answer || (d.comprehension_answers || []).some(Boolean))
      const typed = answersRef.current.essay || answersRef.current.letter || answersRef.current.comprehension.some(Boolean)
      if (!hasText || typed) return
      setAnswers({
        essay: d.essay_answer || '',
        letter: d.letter_answer || '',
        comprehension: subQuestions.map((_, i) => d.comprehension_answers?.[i] || ''),
      })
      setNotice('Restored the draft you saved earlier.')
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Local copy on every change (instant, works offline); server copy every 12s.
  useEffect(() => {
    writeStore(draftKey, { endAt, answers, pausedAt, pauseUsedSec })
  }, [answers, draftKey, endAt, pausedAt, pauseUsedSec])

  const [phase, setPhase] = useState('writing') // writing | saving | done
  useEffect(() => {
    if (phase !== 'writing') return undefined
    const id = setInterval(() => {
      saveServerDraft(user.id, exam.key, mockNumber, answersRef.current, candidateName)
    }, SERVER_SAVE_MS)
    return () => clearInterval(id)
  }, [phase, user.id, exam.key, mockNumber, candidateName])

  // ---- submit + evaluate ----
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [submission, setSubmission] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [evaluation, setEvaluation] = useState(null)
  const [evalLoading, setEvalLoading] = useState(false)
  const [evalError, setEvalError] = useState('')
  const submittingRef = useRef(false)

  const runEvaluation = useCallback(async (row) => {
    setEvalLoading(true)
    setEvalError('')
    try {
      setEvaluation(await evaluateAttempt(row.id))
    } catch (e) {
      setEvalError(e.message)
    } finally {
      setEvalLoading(false)
    }
  }, [])

  const submit = useCallback(async (auto = false) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setConfirmSubmit(false)
    setAutoSubmitted(auto)
    setPhase('saving')
    setSubmitError('')
    const startedAt = endAt - exam.durationSec * 1000
    try {
      const row = await submitAttempt({
        exam: exam.key,
        mockNumber,
        candidateName,
        answers: answersRef.current,
        timeTakenSec: Math.min(exam.durationSec, (Date.now() - startedAt) / 1000),
      })
      writeStore(draftKey, null)
      deleteServerDraft(exam.key, mockNumber)
      setSubmission(row)
      setPhase('done')
      runEvaluation(row)
    } catch (e) {
      // Keep the local draft so nothing is lost; let them try again.
      submittingRef.current = false
      setSubmitError(e.message)
      setPhase('writing')
    }
  }, [endAt, exam, mockNumber, candidateName, draftKey, runEvaluation])

  // If an automatic submit failed (e.g. offline when time ran out), stop the
  // clock from re-firing in a loop; the candidate retries with SUBMIT TEST.
  const timeIsUp = Date.now() >= endAt
  const secondsLeft = useCountdown(phase === 'writing' && !pausedAt && !(submitError && timeIsUp) ? endAt : null, () => submit(true))
  const shownLeft = pausedAt
    ? Math.max(0, Math.ceil((endAt - pausedAt) / 1000))
    : (secondsLeft ?? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)))

  const pauseTest = () => {
    if (pausedAt || phase !== 'writing' || pauseBudgetSec <= 0) return
    saveServerDraft(user.id, exam.key, mockNumber, answersRef.current, candidateName)
    setPausedAt(Date.now())
  }
  const resumeTest = useCallback(() => {
    if (!pausedAt) return
    const used = Math.max(0, Math.min(Math.floor((Date.now() - pausedAt) / 1000), PAUSE_CAP_SEC - pauseUsedSec))
    setEndAt((e) => e + used * 1000)
    setPauseUsedSec((u) => u + used)
    setPausedAt(null)
  }, [pausedAt, pauseUsedSec])
  const pauseLeft = useCountdown(pausedAt ? pausedAt + pauseBudgetSec * 1000 : null, resumeTest)
  const timeLow = shownLeft <= LOW_TIME_SEC

  // Pacing nudge, once: IBPS at 18 min if still on the essay; SBI at 15 min if still on the letter.
  const nudgeAt = exam.key === 'sbi_po' ? 15 * 60 : 18 * 60
  const nudgedRef = useRef(false)
  useEffect(() => {
    if (nudgedRef.current || secondsLeft === null || phase !== 'writing') return
    const elapsed = exam.durationSec - secondsLeft
    if (elapsed >= nudgeAt && tab === tabs[0]) {
      nudgedRef.current = true
      setNotice(exam.key === 'sbi_po'
        ? '15 minutes gone — move on to the essay if your letter is done.'
        : '18 minutes gone — move on to comprehension if you haven’t started it.')
    }
  }, [secondsLeft, tab, tabs, exam, nudgeAt, phase])

  useEffect(() => {
    if (!notice) return undefined
    const t = setTimeout(() => setNotice(''), 8000)
    return () => clearTimeout(t)
  }, [notice])

  // Leaving mid-test asks first.
  useExamLock(phase === 'writing')
  useNavigationBlocker(phase === 'writing' ? (proceed) => setExitPrompt(() => proceed) : null)

  const update = (field, value, idx) => {
    setAnswers((prev) => {
      if (field === 'comprehension') {
        const c = [...prev.comprehension]
        c[idx] = value
        return { ...prev, comprehension: c }
      }
      return { ...prev, [field]: value }
    })
  }

  const clearCurrent = () => {
    if (tab === 'comprehension') setAnswers((p) => ({ ...p, comprehension: p.comprehension.map(() => '') }))
    else setAnswers((p) => ({ ...p, [tab]: '' }))
  }

  const essayWords = countWords(answers.essay)
  const letterWords = countWords(answers.letter)
  const compAnswered = answers.comprehension.filter((a) => a.trim()).length
  const isAnswered = (k) => (k === 'comprehension' ? compAnswered > 0 : countWords(answers[k]) > 0)
  const partLabel = (k) => exam.parts.find((p) => p.key === k)?.label

  if (phase === 'saving' || phase === 'done') {
    return (
      <div className="exam-native-shell">
        <div className="exam-native-topbar">
          <div className="exam-native-brand">{exam.title}</div>
          <span className="exam-native-candidate">Candidate: {candidateName}</span>
        </div>
        <div className="exam-native-body">
          <div className="exam-native-panel exam-native-result">
            <h1 className="exam-native-panel-title">
              {autoSubmitted ? 'Time up — test submitted automatically' : 'Test submitted'}
            </h1>
            <DescriptiveResult
              exam={exam.key}
              submission={submission}
              evaluation={evaluation}
              evalLoading={phase === 'saving' || evalLoading}
              evalError={evalError}
              onRetry={submission ? () => runEvaluation(submission) : undefined}
            />
            <div className="exam-native-modal-actions center">
              <button type="button" className="exam-native-btn clear" onClick={() => navigate('/mocks/results', { force: true })}>All my results</button>
              <button type="button" className="exam-native-btn start" onClick={() => navigate(`/mocks/${exam.key}`, { force: true })}>Back to mock tests</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="exam-native-shell">
      <div className="exam-native-exit-bar">
        <button type="button" className="exam-native-exit" onClick={() => setExitPrompt(() => () => navigate(`/mocks/${exam.key}`, { force: true }))}>← Exit practice mode</button>
      </div>

      <div className="exam-native-topbar">
        <h1 className="exam-native-brand">{exam.title}</h1>
        <div className="exam-native-topbar-right">
          <div className="cm-candidate">
            <CandidatePhoto />
            <span className="cm-candidate-text">
              <small>Candidate Name</small>
              <b>{candidateName}</b>
            </span>
          </div>
        </div>
      </div>

      <div className="exam-native-qnav">
        <div className="exam-native-qnav-left">
          <span className="cm-sections-label">Questions</span>
          {tabs.map((k, i) => (
            <button
              key={k}
              type="button"
              className={`cm-pbtn qtab ${isAnswered(k) ? 'answered' : visitedTabs.has(k) ? 'not-answered' : 'not-visited'}${tab === k ? ' current' : ''}`}
              onClick={() => setTab(k)}
              aria-label={`Question ${i + 1}: ${partLabel(k)}`}
              aria-current={tab === k ? 'true' : undefined}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="exam-native-qnav-legend">
          {PALETTE_LEGEND.filter(({ key }) => ['not-visited', 'not-answered', 'answered'].includes(key)).map(({ key, label }) => (
            <span key={key}><PaletteSymbol kind={key} /> {label}</span>
          ))}
          <span className="cm-clock">
            <PauseButton onClick={pauseTest} left={pauseBudgetSec} />
            <span className={`cm-timer${timeLow ? ' low' : ''}`} role="timer" aria-label={`Time left ${formatTime(shownLeft)}`}>
              <small>Time Left</small> {formatTime(shownLeft)}
            </span>
          </span>
        </div>
      </div>

      <div className="exam-native-body">
        <div className="exam-native-panel">
          {submitError && <p className="dres-error">Couldn&apos;t submit: {submitError}. Your answers are still saved here — try again.</p>}

          {tab === 'letter' && (
            <>
              <div className="exam-native-qheader">Question No. {tabs.indexOf('letter') + 1} — Letter</div>
              <div className="exam-native-topic-text">{prompt.letter_topic}</div>
              {prompt.letter_instructions && <p className="exam-native-instructions-text">{prompt.letter_instructions}</p>}
              <textarea
                className="exam-native-textarea"
                value={answers.letter}
                onChange={(e) => update('letter', e.target.value)}
                placeholder="Write your letter here…"
                aria-label="Letter answer"
                spellCheck={false}
                {...clipboardGuards}
              />
              <div className={`exam-native-wordcount ${wordStatus(letterWords, letterMin, letterMax)}`}>
                {letterWords} words · target {letterMin}–{letterMax}
              </div>
            </>
          )}

          {tab === 'essay' && (
            <>
              <div className="exam-native-qheader">Question No. {tabs.indexOf('essay') + 1} — Essay</div>
              <div className="exam-native-topic-text">{prompt.essay_topic}</div>
              <p className="exam-native-instructions-text">{prompt.essay_instructions}</p>
              <textarea
                className="exam-native-textarea"
                value={answers.essay}
                onChange={(e) => update('essay', e.target.value)}
                placeholder="Start writing your essay here…"
                aria-label="Essay answer"
                spellCheck={false}
                {...clipboardGuards}
              />
              <div className={`exam-native-wordcount ${wordStatus(essayWords, prompt.word_limit_min, prompt.word_limit_max)}`}>
                {essayWords} words · target {prompt.word_limit_min}–{prompt.word_limit_max}
              </div>
            </>
          )}

          {tab === 'comprehension' && (
            <>
              <div className="exam-native-qheader">Question No. {tabs.indexOf('comprehension') + 1} — Comprehension</div>
              <div className="exam-native-passage">{prompt.passage}</div>
              {subQuestions.map((q, i) => {
                const count = countWords(answers.comprehension[i])
                return (
                  <div className="exam-native-subq" key={i}>
                    <label className="exam-native-subq-text" htmlFor={`comp-${i}`}>{i + 1}. {q}</label>
                    <textarea
                      id={`comp-${i}`}
                      className="exam-native-textarea small"
                      value={answers.comprehension[i]}
                      onChange={(e) => update('comprehension', e.target.value, i)}
                      placeholder="Answer in your own words…"
                      spellCheck={false}
                      {...clipboardGuards}
                    />
                    <div className={`exam-native-wordcount ${compStatus(count)}`}>
                      {count} words{count > 80 ? ' · seems long — keep it concise' : ''}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      {notice && (
        <div className="exam-native-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="exam-native-notice-close" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="exam-native-footer">
        <button type="button" className="exam-native-btn clear" onClick={clearCurrent}>CLEAR RESPONSE</button>
        <div className="exam-native-footer-right">
          {tabs.indexOf(tab) < tabs.length - 1
            ? <button type="button" className="exam-native-btn save" onClick={() => setTab(tabs[tabs.indexOf(tab) + 1])}>SAVE &amp; NEXT</button>
            : <button type="button" className="exam-native-btn save" onClick={() => setTab(tabs[tabs.indexOf(tab) - 1])}>&lt;&lt; BACK</button>}
          <button type="button" className="exam-native-btn submit" onClick={() => setConfirmSubmit(true)}>SUBMIT TEST</button>
        </div>
      </div>

      {pausedAt && <PauseOverlay left={pauseLeft} onResume={resumeTest} />}

      {confirmSubmit && (
        <div className="exam-native-modal-overlay" onClick={() => setConfirmSubmit(false)}>
          <div className="exam-native-modal" role="dialog" aria-modal="true" aria-labelledby="submit-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="submit-title">Submit your test?</h3>
            <p>
              {tabs.map((k) => (k === 'comprehension'
                ? `Comprehension: ${compAnswered}/${subQuestions.length} answered`
                : `${partLabel(k)}: ${countWords(answers[k])} words`)).join(' · ')}
              . You can&apos;t edit your answers after submitting.
            </p>
            <div className="exam-native-modal-actions">
              <button type="button" className="exam-native-btn clear" onClick={() => setConfirmSubmit(false)}>CANCEL</button>
              <button type="button" className="exam-native-btn submit" onClick={() => submit(false)}>YES, SUBMIT</button>
            </div>
          </div>
        </div>
      )}

      {exitPrompt && (
        <div className="exam-native-modal-overlay" onClick={() => setExitPrompt(null)}>
          <div className="exam-native-modal" role="dialog" aria-modal="true" aria-labelledby="exit-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="exit-title">Leave this test?</h3>
            <p>Your answers are saved, so you can resume later — but the clock keeps running. If it runs out, your saved answers are submitted when you return.</p>
            <div className="exam-native-modal-actions">
              <button type="button" className="exam-native-btn clear" onClick={() => setExitPrompt(null)}>STAY</button>
              <button
                type="button"
                className="exam-native-btn clear"
                onClick={() => {
                  writeStore(draftKey, null)
                  deleteServerDraft(exam.key, mockNumber)
                  const go = exitPrompt
                  setExitPrompt(null)
                  go()
                }}
              >
                DISCARD ATTEMPT
              </button>
              <button
                type="button"
                className="exam-native-btn save"
                onClick={() => {
                  saveServerDraft(user.id, exam.key, mockNumber, answersRef.current, candidateName)
                  const go = exitPrompt
                  setExitPrompt(null)
                  go()
                }}
              >
                SAVE &amp; EXIT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
