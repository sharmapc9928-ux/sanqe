import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, BookOpen, Building2, ChevronDown, ChevronRight, ClipboardList, Coffee, FileText, Flame, House, LogIn, LogOut, Pencil,
  PencilLine, Plus, ShieldCheck, Target, Timer, Trash2, X,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import { back, linkProps, usePath } from '../lib/router'
import { useApp } from '../lib/appContext'
import { deleteAccount, fetchDreamJob, saveDreamJob } from '../lib/api'
import { displayName, formatTime } from '../lib/format'
import { useFocus } from '../lib/focus'
import { useCountdown } from '../lib/useCountdown'
import { SiteLogo } from './Logo'
import { Modal } from './ui'
import { DREAM_JOB_SUGGESTIONS } from './dreamJobs'
import { CoachProfileCard } from './CoachProfileCard'
import { Avatar, AvatarPicker } from './Avatar'
import { fetchMyCoachings, placeName } from '../lib/coaching'
import { speedScore, TOPIC_BY_KEY } from '../lib/topics'
import { FREE_TOPIC_KEYS } from '../lib/syllabus'

// course: hidden until the student has a course.
export const NAV_ITEMS = [
  { key: 'home', label: 'Home', Icon: House, to: '/', match: (p) => p === '/' },
  { key: 'practice', label: 'Practice', Icon: PencilLine, to: '/practice', match: (p) => p.startsWith('/practice') || p.startsWith('/review') || p.startsWith('/speed') || p.startsWith('/focus') || p.startsWith('/plans') },
  { key: 'daily', label: 'Daily', Icon: Flame, to: '/daily', course: true, match: (p) => p.startsWith('/daily') },
  { key: 'mocks', label: 'Mock Tests', Icon: ClipboardList, to: '/mocks', match: (p) => p.startsWith('/mocks') || p.startsWith('/series') },
  { key: 'learn', label: 'Learn', Icon: BookOpen, to: '/learn', course: true, match: (p) => p.startsWith('/learn') },
]

const TEACHER_NAV_ITEMS = [
  { key: 'coach', label: 'My coaching', Icon: Building2, to: '/coach', match: (p) => p.startsWith('/coach') },
]

// Practice and Mock Tests are always there. A student without a course doesn't
// see Daily and Learn; they appear once they have one. The profile panel opens
// from the avatar in the top bar.
export function NavBar() {
  const path = usePath()
  const { stats, mode, hasCourse, guest } = useApp()
  const teacher = mode === 'teacher'
  const due = stats?.review_due || 0
  const dailyPending = stats && !stats.daily_done_today
  const streak = Number(stats?.streak) || 0
  const items = teacher ? TEACHER_NAV_ITEMS : NAV_ITEMS.filter((i) => hasCourse || !i.course)
  return (
    <nav className="app-sidebar" aria-label="Main navigation">
      <a className="sidebar-brand" {...linkProps(teacher ? '/coach' : '/')} aria-label="Fedge Sanqe home">
        <SiteLogo by={teacher ? 'Portal' : undefined} />
      </a>
      {items.map(({ key, label, Icon, to, match }) => {
        const active = match(path)
        const badge = key === 'practice' && due > 0 ? due : key === 'daily' && dailyPending ? '•' : null
        return (
          <a
            key={key}
            className={`sidebar-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            {...linkProps(to)}
          >
            <span className="sidebar-icon"><Icon size={17} strokeWidth={active ? 2.2 : 1.8} /></span>
            <span className="sidebar-label-text">{label}</span>
            {badge !== null && <span className={`nav-badge${badge === '•' ? ' dot' : ''}`} aria-label={badge === '•' ? 'Not played today' : `${badge} due`}>{badge === '•' ? '' : badge}</span>}
          </a>
        )
      })}
      {!teacher && !hasCourse && (
        <div className="sidebar-foot">
          <a className="sidebar-note" {...linkProps(guest ? '/login' : '/courses')}>
            <b>Got a coaching code?</b>
            It unlocks all of Practice, Daily and Learn.
          </a>
        </div>
      )}
      {!teacher && hasCourse && streak > 0 && (
        <div className="sidebar-foot">
          <a className="sidebar-note sidebar-streak" {...linkProps('/practice')}>
            <b>🔥 {streak}</b>
            day streak · {stats.active_today ? 'done for today' : 'practise today to keep it'}
          </a>
        </div>
      )}
    </nav>
  )
}

export function ProfileButton() {
  const { openProfile, guest, user } = useApp()
  if (guest) {
    return (
      <a className="btn small" {...linkProps('/login')}>
        <LogIn size={14} /> Log in
      </a>
    )
  }
  return (
    <button type="button" className="profile-icon" aria-label="Open profile" aria-haspopup="dialog" onClick={openProfile}>
      <Avatar user={user} size={40} />
    </button>
  )
}

// Links between the public pages, at the foot of the home screen, a
// coaching's page and the contact form.
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <a {...linkProps('/')}>Home</a>
      <a {...linkProps('/for-coaching')}>For coachings</a>
      <a {...linkProps('/contact')}>Contact us</a>
      <a href="/privacy.html">Privacy policy</a>
    </footer>
  )
}

// Standard screen shell: top bar (back + logo + actions + profile), title, body.
export function Page({ title, subtitle, backTo, actions, children, className = '' }) {
  return (
    <main className={`page ${className}`}>
      <header className="topbar">
        <div className="topbar-left">
          {backTo && (
            <button type="button" className="icon-btn back-btn" onClick={() => back(backTo)} aria-label="Back">
              <ArrowLeft size={18} />
            </button>
          )}
          <SiteLogo className="topbar-logo" />
        </div>
        <div className="topbar-right">
          <FocusPill />
          {actions}
          <ProfileButton />
        </div>
      </header>
      {title && <h1 className="heading">{title}</h1>}
      {subtitle && <p className="subheading">{subtitle}</p>}
      {children}
    </main>
  )
}

// Running focus timer, visible from every screen with a top bar.
function FocusPill() {
  const focus = useFocus()
  const path = usePath()
  const left = useCountdown(focus.endAt)
  if (path === '/focus' || (focus.phase !== 'focus' && focus.phase !== 'break')) return null
  const resting = focus.phase === 'break'
  return (
    <a className={`focus-pill${resting ? ' resting' : ''}`} {...linkProps('/focus')} aria-label={`${resting ? 'Break' : 'Focus'} timer`}>
      {resting ? <Coffee size={14} /> : <Timer size={14} />}
      <span>{focus.endAt ? formatTime(left ?? 0) : 'Paused'}</span>
    </a>
  )
}

const THEMES = [
  { key: 'light', label: 'Light' },
  { key: 'cream', label: 'Cream' },
  { key: 'dark', label: 'Dark' },
]

const SPEED_TOPICS = FREE_TOPIC_KEYS.map((k) => TOPIC_BY_KEY[k]).filter(Boolean)

// Lifetime questions answered and the average speed score over the rated
// speed maths drills (null until one is rated).
function profileNumbers(stats) {
  const topics = stats?.topics || {}
  const solved = Object.values(topics).reduce((a, t) => a + (Number(t?.attempted) || 0), 0)
  const scores = SPEED_TOPICS.map((t) => speedScore(topics[t.key], t)).filter((s) => s !== null)
  const speed = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  return { solved, speed, streak: Number(stats?.streak) || 0 }
}

export function ProfilePanel({ open, onClose }) {
  const { user, theme, setTheme, isAdmin, mode, stats } = useApp()
  const teacher = mode === 'teacher'
  const [dreamJob, setDreamJob] = useState('')
  const [editingJob, setEditingJob] = useState(false)
  const [jobDraft, setJobDraft] = useState('')
  const [jobError, setJobError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picking, setPicking] = useState(false)
  const [coachings, setCoachings] = useState(null)

  useEffect(() => {
    if (!open) return undefined
    const onEscape = (e) => { if (e.key === 'Escape' && !confirmDelete && !picking) onClose() }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [open, onClose, confirmDelete, picking])

  // The page behind stops scrolling while the panel is open, so only the
  // panel's own scrollbar shows.
  useEffect(() => {
    if (!open) return undefined
    document.documentElement.classList.add('panel-open')
    return () => document.documentElement.classList.remove('panel-open')
  }, [open])

  useEffect(() => {
    if (!open || !user) return undefined
    let cancelled = false
    fetchDreamJob(user.id).then((job) => { if (!cancelled) setDreamJob(job) }).catch(() => {})
    if (!teacher) fetchMyCoachings().then((c) => { if (!cancelled) setCoachings(c) }).catch(() => { if (!cancelled) setCoachings([]) })
    return () => { cancelled = true }
  }, [open, user, teacher])

  const since = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null
  const nums = profileNumbers(stats)

  const saveJob = async () => {
    const next = jobDraft.trim()
    if (!next) return
    setJobError('')
    try {
      await saveDreamJob(user, next)
      setDreamJob(next)
      setEditingJob(false)
    } catch (e) {
      setJobError(e.message)
    }
  }

  return createPortal(
    <>
      <div className={`profile-backdrop${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`profile-panel${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Profile" aria-hidden={!open} inert={open ? undefined : ''}>
        <div className="profile-panel-head">
          <h2>Profile</h2>
          <button type="button" className="icon-btn" aria-label="Close profile" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Aspirant card: avatar (tap the pencil to change it), name, target exam */}
        <section className="profile-card">
          <div className="profile-card-band">
            <span>{teacher ? 'SANQE · COACHING PORTAL' : 'SANQE · ASPIRANT CARD'}</span>
            {since && <b>Since {since}</b>}
          </div>
          <div className="profile-card-main">
            <div className="profile-card-avatar">
              <Avatar user={user} size={88} />
              <button type="button" className="profile-avatar-edit" aria-label="Change avatar" onClick={() => setPicking(true)}>
                <Pencil size={14} strokeWidth={2.4} />
              </button>
            </div>
            <div className="profile-card-who">
              <h3>{displayName(user)}</h3>
              {user?.email && <p>{user.email}</p>}
            </div>
            {!teacher && (
              <div className="profile-target">
                <span className="profile-target-icon"><Target size={18} /></span>
                {editingJob ? (
                  <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); saveJob() }}>
                    <input
                      list="dream-job-options"
                      value={jobDraft}
                      onChange={(e) => setJobDraft(e.target.value)}
                      maxLength={80}
                      aria-label="Target exam"
                      autoFocus
                    />
                    <datalist id="dream-job-options">
                      {DREAM_JOB_SUGGESTIONS.map((j) => <option key={j} value={j} />)}
                    </datalist>
                    <button type="submit" className="btn small primary">Save</button>
                  </form>
                ) : (
                  <>
                    <span className="profile-target-text">
                      <small>Target exam</small>
                      {dreamJob ? <b className="hl">{dreamJob}</b> : <b className="profile-target-empty">Not set yet</b>}
                    </span>
                    <button type="button" className="link-btn" onClick={() => { setJobDraft(dreamJob); setEditingJob(true) }}>
                      {dreamJob ? 'Edit' : 'Set'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {jobError && <p className="error small profile-card-error">{jobError}</p>}
        </section>

        {teacher && <CoachProfileCard user={user} open={open} onNavigate={onClose} />}

        {!teacher && stats && (
          <section className="profile-stats" aria-label="Your numbers">
            <div className="profile-stat streak"><b className="num"><Flame size={18} /> {nums.streak}</b><span>day streak</span></div>
            <div className="profile-stat"><b className="num">{nums.solved.toLocaleString('en-IN')}</b><span>solved</span></div>
            <div className="profile-stat"><b className="num">{nums.speed ?? '—'}</b><span>speed score</span></div>
          </section>
        )}

        {!teacher && (
          <section className="profile-group">
            <h4>My coaching</h4>
            <div className="profile-list">
              {(coachings || []).map((c) => (
                <a key={c.id} className="profile-item" {...linkProps('/courses')} onClickCapture={onClose}>
                  <span className="crest small" aria-hidden="true">{(c.name || '?').trim().charAt(0).toUpperCase()}</span>
                  <span className="profile-item-text">{c.name}<small>{[placeName(c), `${c.series} course${c.series === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small></span>
                  <ChevronRight size={16} className="profile-item-go" />
                </a>
              ))}
              <a className="profile-item profile-item-add" {...linkProps('/courses')} onClickCapture={onClose}>
                <span className="profile-item-icon add"><Plus size={18} /></span>
                <span className="profile-item-text">{coachings?.length ? 'Add another coaching' : 'Join your coaching'}<small>Enter its referral code</small></span>
              </a>
            </div>
          </section>
        )}

        <section className="profile-group">
          <h4>Appearance</h4>
          <div className="theme-cards" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={theme === key}
                className={`theme-card${theme === key ? ' active' : ''}`}
                onClick={() => setTheme(key)}
              >
                <span className={`theme-swatch ${key}`} aria-hidden="true"><i /><i /><i /></span>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="profile-group">
          <h4>Account</h4>
          <div className="profile-list">
            {isAdmin && (
              <a className="profile-item" {...linkProps('/admin')} onClickCapture={onClose}>
                <span className="profile-item-icon admin"><ShieldCheck size={18} /></span>
                <span className="profile-item-text">Question admin</span>
                <ChevronRight size={16} className="profile-item-go" />
              </a>
            )}
            <a className="profile-item" href="/privacy.html" target="_blank" rel="noopener">
              <span className="profile-item-icon privacy"><FileText size={18} /></span>
              <span className="profile-item-text">Privacy policy</span>
              <ChevronRight size={16} className="profile-item-go" />
            </a>
            <button type="button" className="profile-item" onClick={() => { onClose(); supabase.auth.signOut() }}>
              <span className="profile-item-icon"><LogOut size={18} /></span>
              <span className="profile-item-text">Log out</span>
            </button>
          </div>
        </section>

        {/* Kept quiet and out of the way; it still asks to type DELETE. */}
        <details className="profile-danger">
          <summary>Delete my account <ChevronDown size={14} /></summary>
          <div className="profile-danger-box">
            <p>This permanently deletes your practice history, mistake notebook, daily challenge scores and mock results. It can&apos;t be undone.</p>
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} /> Delete forever…
            </button>
          </div>
        </details>

        <a className="profile-coaching-link" {...linkProps('/partner')} onClickCapture={onClose}>
          Become a partner <ChevronRight size={14} />
        </a>
      </aside>
      <AvatarPicker open={picking} onClose={() => setPicking(false)} user={user} />
      <DeleteAccountDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} />
    </>,
    document.body,
  )
}

function DeleteAccountDialog({ open, onClose }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (!open) { setText(''); setError(''); setBusy(false) } }, [open])

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteAccount()
      await supabase.auth.signOut()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      tone="danger"
      title="Delete your account?"
      actions={(
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn danger-solid" onClick={confirm} disabled={busy || text !== 'DELETE'}>
            {busy ? 'Deleting…' : 'Delete forever'}
          </button>
        </>
      )}
    >
      <p>This permanently deletes your account and everything linked to it: practice history, mistake notebook, daily challenge scores, descriptive answers and evaluations. It can&apos;t be undone.</p>
      <label className="field">
        <span>Type <b>DELETE</b> to confirm</span>
        <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
      </label>
      {error && <p className="error small">{error}</p>}
    </Modal>
  )
}
