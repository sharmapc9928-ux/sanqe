// localStorage can be missing or throw (private mode, blocked site data), so
// every access goes through these helpers and degrades to "nothing stored".

export function readStore(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeStore(key, value) {
  try {
    if (value === undefined || value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable — the value just won't survive a reload
  }
}

// Keys that belong to one account, so two people sharing a phone never see
// each other's drafts, names or flags.
export const userKey = (userId, name) => `sanqe:${userId}:${name}`

// Device-wide preferences (not personal data).
export const THEME_KEY = 'sanqe-theme'
export const LANG_KEY = 'sanqe-explanation-lang'

// Where to go after logging in, e.g. back to the coaching page the student
// came from. In localStorage (not session) so it survives Google sign-in and
// the email-confirmation link opening in a new tab.
const RETURN_KEY = 'sanqe-return-to'
const RETURN_TTL_MS = 24 * 60 * 60 * 1000

export function saveReturnTo(path, label) {
  writeStore(RETURN_KEY, { path, label, at: Date.now() })
}

// { path, label } or null. Doesn't clear it (the login screen only peeks).
export function peekReturnTo() {
  const r = readStore(RETURN_KEY)
  if (!r || typeof r.path !== 'string' || !r.path.startsWith('/') || Date.now() - (r.at || 0) > RETURN_TTL_MS) return null
  return r
}

export function takeReturnTo() {
  const r = peekReturnTo()
  writeStore(RETURN_KEY, null)
  return r
}
