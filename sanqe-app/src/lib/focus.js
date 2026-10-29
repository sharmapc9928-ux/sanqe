import { useSyncExternalStore } from 'react'
import { readStore, userKey, writeStore } from './storage'
import { vibrate } from './haptics'

// Focus timer: Pomodoro and 52/17.
//
// One timer for the whole app, stored with timestamps so it stays right
// when the phone sleeps or the app is closed and reopened. A focus block
// ends → the break starts by itself → when the break ends the timer waits
// for you to start the next block.

export const TECHNIQUES = {
  pomodoro: {
    key: 'pomodoro',
    name: 'Pomodoro',
    focusMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    longEvery: 4,
    summary: '25 min focus · 5 min break · long break after 4 rounds',
    detail: 'Work in short, intense 25-minute rounds with a 5-minute break after each. After every fourth round take a longer 15-minute break. Good for topics that tire you quickly — calculation drills, puzzles.',
  },
  fifty_two: {
    key: 'fifty_two',
    name: '52 / 17',
    focusMin: 52,
    breakMin: 17,
    summary: '52 min deep work · 17 min complete break',
    detail: 'A longer stretch of deep work followed by a real break away from the screen. Good for full sectional practice and mock-style sessions where you need to stay in flow.',
  },
}

const IDLE = { technique: 'pomodoro', phase: 'idle', endAt: null, pausedLeft: null, round: 0, breakLong: false }

let key = null
let state = IDLE
let timer = null
const listeners = new Set()

const breakMinutes = (s) => {
  const t = TECHNIQUES[s.technique]
  return s.breakLong && t.longBreakMin ? t.longBreakMin : t.breakMin
}

function set(next, { silent = false } = {}) {
  state = next
  if (key) writeStore(key, state.phase === 'idle' && state.round === 0 ? null : state)
  schedule()
  if (!silent) listeners.forEach((l) => l())
}

// Move through any phases that ended while we weren't looking.
function advance(now = Date.now()) {
  let s = state
  let changed = false
  let alertWith = null
  let endedAt = 0
  while (s.endAt && s.endAt <= now) {
    changed = true
    endedAt = s.endAt
    if (s.phase === 'focus') {
      const t = TECHNIQUES[s.technique]
      const round = s.round + 1
      const breakLong = !!t.longEvery && round % t.longEvery === 0
      const next = { ...s, phase: 'break', round, breakLong }
      s = { ...next, endAt: s.endAt + breakMinutes(next) * 60000 }
      alertWith = breakLong ? `Round ${round} done — take a ${t.longBreakMin}-minute break.` : `Round ${round} done — break time.`
    } else {
      s = { ...s, phase: 'ready', endAt: null }
      alertWith = 'Break over — ready for the next round?'
    }
  }
  if (changed) {
    set(s)
    // Alert only for a change that happened just now, not one that ended
    // while the app was in the background long ago.
    if (alertWith && now - endedAt < 10000) notify(alertWith)
  }
}

function schedule() {
  clearTimeout(timer)
  if (state.endAt) timer = setTimeout(() => advance(), Math.max(0, state.endAt - Date.now()) + 50)
}

function notify(text) {
  vibrate([200, 100, 200])
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx) {
      const ctx = new Ctx()
      ;[0, 0.25].forEach((delay) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay)
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + delay + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.2)
        osc.connect(gain).connect(ctx.destination)
        osc.start(ctx.currentTime + delay)
        osc.stop(ctx.currentTime + delay + 0.22)
      })
      setTimeout(() => ctx.close(), 800)
    }
  } catch {
    // audio not available
  }
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Fedge Sanqe', { body: text, icon: '/pwa-192x192.png', tag: 'sanqe-focus' })
    }
  } catch {
    // notifications not available (some WebViews)
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) advance() })
}

// Called once per signed-in user (timer state is per account).
export function loadFocus(userId) {
  key = userKey(userId, 'focus')
  const saved = readStore(key, null)
  state = saved && TECHNIQUES[saved.technique] ? { ...IDLE, ...saved } : IDLE
  schedule()
  // Catch up silently on anything that ended while the app was closed.
  const now = Date.now()
  if (state.endAt && state.endAt <= now) {
    let s = state
    while (s.endAt && s.endAt <= now) {
      if (s.phase === 'focus') {
        const t = TECHNIQUES[s.technique]
        const round = s.round + 1
        const breakLong = !!t.longEvery && round % t.longEvery === 0
        const next = { ...s, phase: 'break', round, breakLong }
        s = { ...next, endAt: s.endAt + breakMinutes(next) * 60000 }
      } else {
        s = { ...s, phase: 'ready', endAt: null }
      }
    }
    set(s, { silent: true })
  }
  listeners.forEach((l) => l())
}

function askNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {})
  } catch {
    // ignore
  }
}

export const focusActions = {
  // Start (or restart) a focus block. Returns its end time.
  start(technique = state.technique) {
    askNotificationPermission()
    const t = TECHNIQUES[technique]
    const sameTechnique = technique === state.technique
    const endAt = Date.now() + t.focusMin * 60000
    set({ ...state, technique, phase: 'focus', endAt, pausedLeft: null, round: sameTechnique ? state.round : 0, breakLong: false })
    return endAt
  },
  pause() {
    if (!state.endAt) return
    set({ ...state, pausedLeft: Math.max(0, state.endAt - Date.now()), endAt: null })
  },
  resume() {
    if (state.pausedLeft === null) return
    set({ ...state, endAt: Date.now() + state.pausedLeft, pausedLeft: null })
  },
  // Skip the rest of the current phase.
  skip() {
    if (state.phase === 'focus' || state.phase === 'break') {
      set({ ...state, endAt: Date.now() - 1, pausedLeft: null }, { silent: true })
      advance()
    }
  },
  reset() {
    set({ ...IDLE, technique: state.technique })
  },
  choose(technique) {
    if (technique === state.technique) return
    set({ ...IDLE, technique })
  },
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => state

export function useFocus() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export const phaseMinutes = (s) => (s.phase === 'break' ? breakMinutes(s) : TECHNIQUES[s.technique].focusMin)
