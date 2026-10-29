import { ArrowRight, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { Page } from '../components/Layout'
import { Ring } from '../components/ui'
import { linkProps } from '../lib/router'
import { TECHNIQUES, focusActions, phaseMinutes, useFocus } from '../lib/focus'
import { useCountdown } from '../lib/useCountdown'
import { formatTime } from '../lib/format'

const PHASE_LABEL = { idle: 'Ready', focus: 'Focus', break: 'Break', ready: 'Break over' }

export default function FocusTimer() {
  const focus = useFocus()
  const t = TECHNIQUES[focus.technique]
  const left = useCountdown(focus.endAt)
  const total = phaseMinutes(focus) * 60
  const secondsLeft = focus.endAt ? left ?? 0 : focus.pausedLeft !== null ? Math.ceil(focus.pausedLeft / 1000) : total
  const running = !!focus.endAt
  const paused = focus.pausedLeft !== null
  const active = focus.phase === 'focus' || focus.phase === 'break'
  const resting = focus.phase === 'break'
  const label = focus.phase === 'break' && focus.breakLong ? 'Long break' : PHASE_LABEL[focus.phase]
  const roundsShown = t.longEvery || 4

  return (
    <Page backTo="/practice" title="Focus timer" subtitle="Study in timed blocks with real breaks — it keeps running while you practise in any topic.">
      <div className="segmented technique-switch" role="radiogroup" aria-label="Technique">
        {Object.values(TECHNIQUES).map((x) => (
          <button
            key={x.key}
            type="button"
            role="radio"
            aria-checked={focus.technique === x.key}
            className={focus.technique === x.key ? 'active' : ''}
            onClick={() => focusActions.choose(x.key)}
          >
            {x.name}
          </button>
        ))}
      </div>

      <section className={`card focus-card${resting ? ' resting' : ''}`}>
        <Ring
          value={active ? secondsLeft / total : 1}
          size={220}
          stroke={12}
          color={resting ? 'var(--green)' : 'var(--accent)'}
          label={`${label}, ${formatTime(secondsLeft)} left`}
        >
          <span className="focus-time" role="timer">{formatTime(secondsLeft)}</span>
          <span className="focus-phase">{paused ? 'Paused' : label}</span>
        </Ring>

        <div className="focus-rounds" aria-label={`${focus.round} rounds done`}>
          {Array.from({ length: roundsShown }, (_, i) => (
            <span key={i} className={i < focus.round % roundsShown || (focus.round > 0 && focus.round % roundsShown === 0) ? 'done' : ''} />
          ))}
          <span className="focus-round-text">{focus.round} round{focus.round === 1 ? '' : 's'} done</span>
        </div>

        <div className="focus-controls">
          {!active && (
            <button type="button" className="btn primary big" onClick={() => focusActions.start(focus.technique)}>
              <Play size={16} /> {focus.phase === 'ready' ? `Start round ${focus.round + 1}` : 'Start focus'}
            </button>
          )}
          {active && running && <button type="button" className="btn big" onClick={focusActions.pause}><Pause size={16} /> Pause</button>}
          {active && paused && <button type="button" className="btn primary big" onClick={focusActions.resume}><Play size={16} /> Resume</button>}
          {active && <button type="button" className="btn ghost" onClick={focusActions.skip}><SkipForward size={16} /> {resting ? 'Skip break' : 'End block'}</button>}
          {(active || focus.round > 0) && <button type="button" className="btn ghost" onClick={focusActions.reset}><RotateCcw size={16} /> Reset</button>}
        </div>
      </section>

      {focus.phase === 'focus' && (
        <a className="card learn-link" {...linkProps('/practice')}>
          <ArrowRight size={18} />
          <span><strong>Practise during this block</strong> — choose “{t.name}” on any topic to use the time left.</span>
        </a>
      )}

      <section className="technique-notes">
        {Object.values(TECHNIQUES).map((x) => (
          <div key={x.key} className={`technique-note${focus.technique === x.key ? ' current' : ''}`}>
            <h2>{x.name}</h2>
            <p className="technique-summary">{x.summary}</p>
            <p>{x.detail}</p>
          </div>
        ))}
      </section>
    </Page>
  )
}
