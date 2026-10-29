import { Pause, Play, User } from 'lucide-react'
import { formatTime } from '../lib/format'

// Pieces shared by every exam-style window (series mocks, descriptive
// mocks): the candidate photo box, the five question-palette symbols and
// the standard "General Instructions" page the real IBPS / TCS iON exam
// shows before the test.

export function CandidatePhoto({ size = 'md' }) {
  return (
    <span className={`cm-photo ${size}`} aria-hidden="true">
      <User size={size === 'lg' ? 40 : 22} strokeWidth={1.6} />
    </span>
  )
}

// Order and wording follow the real palette legend.
export const PALETTE_LEGEND = [
  { key: 'not-visited', label: 'Not Visited' },
  { key: 'not-answered', label: 'Not Answered' },
  { key: 'answered', label: 'Answered' },
  { key: 'marked', label: 'Marked for Review' },
  { key: 'answered-marked', label: 'Answered & Marked for Review (will be considered for evaluation)' },
]

// Pause button for the clock bar. `left` = pause time still available (seconds).
export function PauseButton({ onClick, busy, left }) {
  const none = left <= 0
  return (
    <button
      type="button"
      className="cm-pause-btn"
      onClick={onClick}
      disabled={busy || none}
      title={none ? 'No pause time left' : `${formatTime(left)} of pause time left`}
    >
      <Pause size={14} /> Pause
    </button>
  )
}

// Covers the whole test while it is paused so the questions can't be read.
export function PauseOverlay({ left, onResume, busy }) {
  return (
    <div className="cm-pause-overlay" role="dialog" aria-modal="true" aria-label="Test paused">
      <div className="cm-pause-card">
        <Pause size={34} />
        <h2>Test paused</h2>
        <p>The test clock is stopped. Your answers are saved.</p>
        <p className="cm-pause-left">Pause time left <b>{formatTime(left ?? 0)}</b></p>
        <p className="cm-pause-note">When the pause time ends, the test starts again by itself.</p>
        <button type="button" className="exam-native-btn start" onClick={onResume} disabled={busy}>
          <Play size={13} /> RESUME TEST
        </button>
      </div>
    </div>
  )
}

export function PaletteSymbol({ kind, children }) {
  return <span className={`cm-pbtn ${kind}`} aria-hidden="true">{children}</span>
}

// The standard exam instructions (page 1 of the instructions): clock, palette
// symbols, collapse / scroll arrows, navigation and answering. `sections` is
// false for a single-section test.
export function GeneralInstructions({ totalMinutes, sectional, sections = true, questions }) {
  return (
    <div className="ex-instr">
      <h3>Please read the instructions carefully</h3>
      <h4>General Instructions:</h4>
      <ol>
        <li>
          Total duration of the examination is <b>{totalMinutes} minutes</b>
          {questions ? <> for <b>{questions} questions</b></> : null}.
          {sections && sectional ? ' The sections are separately timed.' : ''}
        </li>
        <li>
          The clock will be set at the server. The countdown timer in the top right corner of the screen will display the remaining
          time available for you to complete the {sections && sectional ? 'section' : 'examination'}. When the timer reaches zero, the{' '}
          {sections && sectional ? 'section' : 'examination'} will end by itself. You will not be required to end or submit it.
        </li>
        <li>
          The Question Palette displayed on the right side of the screen will show the status of each question using one of the following symbols:
          <div className="ex-lg-row"><PaletteSymbol kind="not-visited">1</PaletteSymbol>You have not visited the question yet.</div>
          <div className="ex-lg-row"><PaletteSymbol kind="not-answered">3</PaletteSymbol>You have not answered the question.</div>
          <div className="ex-lg-row"><PaletteSymbol kind="answered">5</PaletteSymbol>You have answered the question.</div>
          <div className="ex-lg-row"><PaletteSymbol kind="marked">7</PaletteSymbol>You have NOT answered the question, but have marked the question for review.</div>
          <div className="ex-lg-row"><PaletteSymbol kind="answered-marked">9</PaletteSymbol>You have answered the question, but marked it for review.</div>
          The <b>Marked for Review</b> status for a question simply indicates that you would like to look at that question again. If a
          question is answered and Marked for Review, your answer for that question will be considered in the evaluation.
        </li>
        <li>
          You can click on the "&gt;" arrow which appears to the left of the question palette to collapse the palette and maximise the
          question window. To view the question palette again, you can click on "&lt;" which appears on the right side of the question window.
        </li>
        <li>
          The mouse wheel does not scroll during the test. Use the scroll-up and scroll-down arrows in the question area, or the scroll
          bar, to go to the top or the bottom of the question.
        </li>
      </ol>
      <h4>Navigating to a Question:</h4>
      <ol start={6}>
        <li>
          To answer a question, do the following:
          <ol>
            <li>Click on the question number in the Question Palette at the right of your screen to go to that numbered question directly. Note that using this option does NOT save your answer to the current question.</li>
            <li>Click on <b>Save &amp; Next</b> to save your answer for the current question and then go to the next question.</li>
            <li>Click on <b>Mark for Review &amp; Next</b> to save your answer for the current question, mark it for review, and then go to the next question.</li>
          </ol>
        </li>
      </ol>
      <h4>Answering a Question:</h4>
      <ol start={7}>
        <li>
          Procedure for answering a multiple choice type question:
          <ol>
            <li>To select your answer, click on the button of one of the options.</li>
            <li>To change your answer, click on the button of another option.</li>
            <li>To save your answer, you MUST click on the <b>Save &amp; Next</b> button.</li>
            <li>To deselect a chosen answer, click on the chosen option again or click on the <b>Clear Response</b> button.</li>
            <li>To mark the question for review, click on the <b>Mark for Review &amp; Next</b> button.</li>
          </ol>
        </li>
        <li>To change your answer to a question that has already been answered, first select that question for answering and then follow the procedure for answering that type of question.</li>
        {sections && (
          <li>
            Sections in this question paper are displayed on the top bar of the screen. The section you are currently viewing is
            highlighted.{sectional
              ? ' When the time of a section is over you move to the next section and cannot return to the earlier one.'
              : ' One timer runs for the whole paper and you can move between sections freely.'}
          </li>
        )}
        <li>You can <b>Pause</b> the test for up to 10 minutes in total. The clock stops while it is paused, and the questions are hidden. When the pause time is used up, the test starts again by itself.</li>
        <li>Your saved answers are also stored on the server as you go. If you leave, you can resume — but <b>the clock keeps running</b>.</li>
      </ol>
    </div>
  )
}
