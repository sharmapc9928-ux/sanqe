export function formatTime(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// 12_340 ms -> "12.3s"
export function formatSeconds(ms) {
  if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return '—'
  const s = Number(ms) / 1000
  return s >= 100 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`
}

export function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

// "12 Nov 2026"
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export function formatShortDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

export function countWords(text) {
  const trimmed = (text || '').trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'Burning the midnight oil'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function firstName(user) {
  const meta = user?.user_metadata || {}
  const full = (meta.full_name || meta.name || '').trim()
  return full ? full.split(/\s+/)[0] : ''
}

export function displayName(user) {
  const meta = user?.user_metadata || {}
  return (meta.full_name || meta.name || '').trim() || user?.email?.split('@')[0] || 'Aspirant'
}

// Fisher–Yates shuffle (returns a new array).
export function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
