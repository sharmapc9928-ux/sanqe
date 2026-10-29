import { useEffect, useRef, useSyncExternalStore } from 'react'

// Tiny History-API router. Every screen has a real URL, so the Android /
// browser back button walks back through screens instead of closing the app,
// and a refresh re-opens the same screen.
//
// Each entry we push carries { idx } — its depth inside the app — so back()
// knows whether there is an in-app screen to return to.

const listeners = new Set()
const blockers = new Set()

// On the server (public pages are rendered there) there is no window; the
// renderer sets the path it is rendering instead.
const inBrowser = typeof window !== 'undefined'
let serverPath = '/'
export function setServerPath(path) { serverPath = path }

const getPath = () => (inBrowser ? window.location.pathname : serverPath)
const getIdx = () => (inBrowser && window.history.state && typeof window.history.state.idx === 'number' ? window.history.state.idx : 0)

if (inBrowser && typeof window.history.state?.idx !== 'number') {
  window.history.replaceState({ idx: 0 }, '', window.location.href)
}

let currentPath = getPath()
let currentIdx = getIdx()

function emit() {
  currentPath = getPath()
  currentIdx = getIdx()
  listeners.forEach((l) => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function activeBlocker() {
  for (const b of blockers) if (b.current) return b.current
  return null
}

export function navigate(to, { replace = false, force = false } = {}) {
  if (to === getPath()) return
  const go = () => {
    if (replace) window.history.replaceState({ idx: getIdx() }, '', to)
    else window.history.pushState({ idx: getIdx() + 1 }, '', to)
    window.scrollTo(0, 0)
    emit()
  }
  const blocker = force ? null : activeBlocker()
  if (blocker) blocker(go)
  else go()
}

// Go to the previous in-app screen, or to `fallback` when this screen was
// opened directly (deep link / refresh) and there is nothing behind it.
export function back(fallback = '/') {
  if (getIdx() > 0) window.history.back()
  else navigate(fallback, { replace: true })
}

if (inBrowser) {
  window.addEventListener('popstate', () => {
    const blocker = activeBlocker()
    if (blocker) {
      const target = window.location.href
      const targetIdx = getIdx()
      // Put the screen we were on back, then ask. Confirming replays the move.
      window.history.pushState({ idx: currentIdx }, '', currentPath)
      blocker(() => {
        window.history.replaceState({ idx: targetIdx }, '', target)
        window.scrollTo(0, 0)
        emit()
      })
      return
    }
    window.scrollTo(0, 0)
    emit()
  })
}

export function usePath() {
  return useSyncExternalStore(subscribe, getPath, getPath)
}

// While `onBlock` is a function, in-app navigation and the back button are
// paused and `onBlock(proceed)` is called instead — used to confirm leaving
// a running test. Pass null to stop blocking.
export function useNavigationBlocker(onBlock) {
  const ref = useRef(onBlock)
  ref.current = onBlock
  useEffect(() => {
    blockers.add(ref)
    return () => { blockers.delete(ref) }
  }, [])
}

// Match "/practice/:topic/quiz" style patterns. Returns params or null.
export function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

// Props for a plain <a> that navigates in-app (keeps open-in-new-tab working).
export function linkProps(to) {
  return {
    href: to,
    onClick: (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      navigate(to)
    },
  }
}
