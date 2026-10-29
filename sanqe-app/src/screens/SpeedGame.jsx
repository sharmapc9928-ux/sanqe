import { useEffect, useRef, useState } from 'react'
import { Play, Trophy } from 'lucide-react'
import { Page } from '../components/Layout'
import { useApp } from '../lib/appContext'
import { HAPTIC_CORRECT, HAPTIC_WRONG, vibrate } from '../lib/haptics'
import { readStore, userKey, writeStore } from '../lib/storage'
import { useCountdown } from '../lib/useCountdown'

const GAME_SECONDS = 60
const NUMBERS_PER_ROUND = 10
const RADIUS = 112 // px from the circle's centre to each number
const COMPACT_RADIUS = 78 // the smaller circle on the home screen
// Countdown ring inside the circle (SVG units on a 200×200 box).
const RING_R = 48
const RING_C = 2 * Math.PI * RING_R
// Number bubbles take the subject colours in turn.
const BUBBLE_HUES = ['blue', 'violet', 'rose', 'teal', 'amber']

const randomTwoDigit = () => 10 + Math.floor(Math.random() * 90)
const newRound = () => Array.from({ length: NUMBERS_PER_ROUND }, randomTwoDigit)

export default function SpeedGame() {
  return (
    <Page backTo="/practice" title="Circle Game" subtitle="Add all ten numbers. Every correct total scores a point — how many can you clear in 60 seconds?">
      <div className="speed-game-wrap">
        <CircleGame />
      </div>
    </Page>
  )
}

// Speed-addition drill: ten 2-digit numbers sit around a circle; add them
// before the minute runs out. Personal best is kept on this device. Also
// played straight from the student home screen.
// compact: the smaller version on the home screen.
export function CircleGame({ compact = false }) {
  const { user } = useApp()
  const bestKey = userKey(user?.id || 'guest', 'circle-best')
  const [phase, setPhase] = useState('ready') // ready | playing | over
  const [endAt, setEndAt] = useState(null)
  const [numbers, setNumbers] = useState(newRound)
  const [answer, setAnswer] = useState('')
  const [score, setScore] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [best, setBest] = useState(() => readStore(bestKey, 0))
  const [newBest, setNewBest] = useState(false)
  const inputRef = useRef(null)
  const scoreRef = useRef(0)

  const secondsLeft = useCountdown(endAt, () => {
    setPhase('over')
    setEndAt(null)
    if (scoreRef.current > best) {
      setBest(scoreRef.current)
      setNewBest(true)
      writeStore(bestKey, scoreRef.current)
    }
  })

  useEffect(() => {
    if (phase === 'playing') inputRef.current?.focus()
  }, [phase, numbers])

  const start = () => {
    setNumbers(newRound())
    setAnswer('')
    setScore(0)
    scoreRef.current = 0
    setWrong(0)
    setFeedback(null)
    setNewBest(false)
    setEndAt(Date.now() + GAME_SECONDS * 1000)
    setPhase('playing')
  }

  const submit = (e) => {
    e.preventDefault()
    if (phase !== 'playing' || answer.trim() === '') return
    const sum = numbers.reduce((a, b) => a + b, 0)
    const ok = Number(answer) === sum
    if (ok) {
      scoreRef.current += 1
      setScore(scoreRef.current)
    } else {
      setWrong((w) => w + 1)
    }
    vibrate(ok ? HAPTIC_CORRECT : HAPTIC_WRONG)
    setFeedback({ ok, sum, given: Number(answer) })
    setAnswer('')
    setNumbers(newRound())
  }

  const left = phase === 'playing' ? secondsLeft ?? GAME_SECONDS : GAME_SECONDS
  const playing = phase === 'playing'
  const radius = compact ? COMPACT_RADIUS : RADIUS

  return (
    <section className={`add-game card${compact ? ' compact' : ''}`} aria-label="Addition circle game">
      <div className="add-game-head">
        <span className="eyebrow">Add all ten · {GAME_SECONDS} s</span>
        <div className="add-game-stats num">
          <span className="add-game-best"><Trophy size={13} /> Best <b>{best}</b></span>
          <span className="ok">✓ <b>{score}</b></span>
          <span className="bad">✗ <b>{wrong}</b></span>
        </div>
      </div>

      {phase !== 'over' && (
        <div className="add-circle" aria-label={playing ? `Numbers to add: ${numbers.join(', ')}` : undefined}>
          <svg className="add-circle-ring" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r={RING_R} className="add-ring-track" />
            <circle
              cx="100" cy="100" r={RING_R} className={`add-ring-left${left <= 10 && playing ? ' low' : ''}`}
              strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - left / GAME_SECONDS)} transform="rotate(-90 100 100)"
            />
          </svg>
          {numbers.map((n, i) => {
            const angle = (i / NUMBERS_PER_ROUND) * 2 * Math.PI - Math.PI / 2
            return (
              <span
                key={i}
                className={`add-circle-num${playing ? ` hue-${BUBBLE_HUES[i % BUBBLE_HUES.length]}` : ' idle'}`}
                style={{ transform: `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)` }}
              >
                {playing ? n : '?'}
              </span>
            )
          })}
          <span className={`add-circle-clock num${left <= 10 && playing ? ' low' : ''}`} aria-live="off">
            {String(left).padStart(2, '0')}
            <small>seconds</small>
          </span>
        </div>
      )}

      {phase === 'ready' && (
        <div className="add-game-start">
          <button type="button" className="btn accent big" onClick={start}><Play size={16} /> Start</button>
        </div>
      )}

      {playing && (
        <>
          <form className="add-game-form" onSubmit={submit}>
            <label className="add-game-answer">
              <span>Total</span>
              <input
                ref={inputRef}
                className="add-game-input num"
                type="number"
                inputMode="numeric"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="—"
                aria-label="Sum of all numbers"
              />
            </label>
            <button className="btn accent big" type="submit" disabled={answer.trim() === ''}>Check</button>
          </form>

          {feedback && (
            <p className={`add-game-feedback ${feedback.ok ? 'ok' : 'bad'}`} role="status">
              {feedback.ok ? `✓ Correct — ${feedback.sum}` : `✗ You wrote ${feedback.given} — the total was ${feedback.sum}`}
            </p>
          )}
        </>
      )}

      {phase === 'over' && (
        <div className="add-game-intro">
          <p className="add-game-final">
            <span className="add-game-big num">{score}</span>
            circle{score === 1 ? '' : 's'} cleared{wrong > 0 ? ` · ${wrong} wrong` : ''}
          </p>
          {newBest && <p className="new-best"><Trophy size={16} /> New personal best</p>}
          <button type="button" className="btn accent big" onClick={start}>Play again</button>
        </div>
      )}

      {phase !== 'over' && !compact && (
        <p className="add-game-tip"><b>Topper trick:</b> pair numbers into round tens (<span className="num">23 + 47 = 70</span>) instead of adding left to right.</p>
      )}
    </section>
  )
}
