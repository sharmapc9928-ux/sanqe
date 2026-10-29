import { useEffect } from 'react'

// Locks the page down the way the real IBPS / TCS iON exam window is while a
// test is running: the mouse wheel does not scroll (the scrollbars still do),
// right-click, copy / cut / paste, text selection, drag, print / save /
// view-source / select-all shortcuts are off, and leaving or reloading the
// page asks first. Typing in the answer boxes of descriptive tests still works.
const BLOCKED_CTRL_KEYS = new Set(['c', 'x', 'v', 'a', 'p', 's', 'u', 'f', 'g', 'o'])

export function useExamLock(active) {
  useEffect(() => {
    if (!active) return undefined
    const stop = (e) => e.preventDefault()
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase()
      if (e.key === 'F12' || e.key === 'F3' || e.key === 'PrintScreen') { e.preventDefault(); return }
      if (!(e.ctrlKey || e.metaKey)) return
      if (BLOCKED_CTRL_KEYS.has(k) || (e.shiftKey && ['i', 'j', 'c'].includes(k))) e.preventDefault()
    }
    const onUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    const prev = document.documentElement.style.overscrollBehavior
    document.documentElement.style.overscrollBehavior = 'none'
    document.addEventListener('wheel', stop, { passive: false })
    document.addEventListener('contextmenu', stop)
    document.addEventListener('copy', stop)
    document.addEventListener('cut', stop)
    document.addEventListener('paste', stop)
    document.addEventListener('dragstart', stop)
    document.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.documentElement.style.overscrollBehavior = prev
      document.removeEventListener('wheel', stop)
      document.removeEventListener('contextmenu', stop)
      document.removeEventListener('copy', stop)
      document.removeEventListener('cut', stop)
      document.removeEventListener('paste', stop)
      document.removeEventListener('dragstart', stop)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [active])
}
