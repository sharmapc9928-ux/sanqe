import { useEffect, useRef, useState } from 'react'

// Countdown to a fixed end time (ms since epoch).
//
// Time is derived from the wall clock, not by counting interval ticks, so it
// stays correct when the phone sleeps or the tab is backgrounded (browsers
// pause timers there — tick-counting would hand out free extra time).
// `onExpire` fires once when the end time is reached. Pass endAt = null to pause.
export function useCountdown(endAt, onExpire) {
  const calc = () => (endAt ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : null)
  const [secondsLeft, setSecondsLeft] = useState(calc)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    if (!endAt) {
      setSecondsLeft(null)
      return undefined
    }
    let fired = false
    let expireTimer = null
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0 && !fired) {
        fired = true
        // Run outside the effect so the callback may update state / navigate freely.
        expireTimer = setTimeout(() => onExpireRef.current?.(), 0)
      }
    }
    tick()
    const id = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      clearTimeout(expireTimer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [endAt])

  return secondsLeft
}

// Seconds elapsed since `startAt` (ms since epoch), refreshed ~4x a second.
// Returns 0 while startAt is null. Freezes at `stopAt` when given.
export function useElapsed(startAt, stopAt = null) {
  const calc = () => (startAt ? Math.max(0, Math.floor(((stopAt || Date.now()) - startAt) / 1000)) : 0)
  const [elapsed, setElapsed] = useState(calc)
  useEffect(() => {
    setElapsed(calc())
    if (!startAt || stopAt) return undefined
    const id = setInterval(() => setElapsed(calc()), 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt, stopAt])
  return elapsed
}
