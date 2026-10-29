import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { LogoMark } from '../components/Logo'
import { navigate } from '../lib/router'
import { peekReturnTo, saveReturnTo, takeReturnTo } from '../lib/storage'

export default function Login() {
  // Set when the student came from a coaching's page; they go back there after.
  const [returnTo] = useState(peekReturnTo)
  // No role picker: logging in opens the student home, except from the
  // coaching portal's own link (/coach), which it goes back to afterwards —
  // also after Google sign-in and the email confirmation link.
  const [role] = useState(() => {
    if (returnTo || !/^\/coach(\/|$)/.test(window.location.pathname)) return 'student'
    saveReturnTo('/coach', 'your coaching portal')
    return 'teacher'
  })
  const teacher = role === 'teacher'
  const [mode, setMode] = useState(returnTo ? 'signup' : 'login') // 'login' | 'signup' | 'forgot'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setInfo('')
  }

  const handleGoogle = async () => {
    setError('')
    setInfo('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    // On success the browser redirects to Google, then back here with a session.
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      // On success, the auth listener in App.jsx picks up the new session.
    } else if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim(), signed_up_as: role } },
      })
      if (error) {
        setError(error.message)
      } else if (!data.session) {
        setInfo('Account created — check your email to confirm it, then log in.')
        setMode('login')
      }
    } else {
      // forgot password
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) setError(error.message)
      else setInfo('Password reset link sent — check your email.')
    }
    setLoading(false)
  }

  const [titleStart, titleEnd] = mode === 'login' ? ['Welcome', 'back.'] : mode === 'signup' ? ['Create your', 'account.'] : ['Reset your', 'password.']

  return (
    <div className="login-shell">
      <main className="login-main">
      <div className="login-card">
        <div className="login-brand">
          <LogoMark size={32} />
          <span className="logo-word">Sanqe</span>
        </div>
        <h1 className="login-title">{titleStart} <em>{titleEnd}</em></h1>
        <p className="login-sub">
          {mode === 'forgot'
            ? "Enter your email and we'll send you a reset link."
            : returnTo
              ? `${mode === 'login' ? 'Log in' : 'Sign up'} to continue to ${returnTo.label}.`
              : teacher
                ? mode === 'login'
                  ? 'Log in to your coaching portal.'
                  : 'Sign up to sell your mocks to your students.'
                : mode === 'login'
                  ? 'Log in to continue your practice.'
                  : 'Sign up to start practicing.'}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="login-field">
              <label htmlFor="login-name">Name</label>
              <input
                id="login-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode !== 'forgot' && (
            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
          )}

          {mode === 'login' && (
            <button
              type="button"
              className="login-forgot-btn"
              onClick={() => switchMode('forgot')}
            >
              Forgot password?
            </button>
          )}

          {error && <p className="login-error">⚠ {error}</p>}
          {info && <p className="login-info">✔ {info}</p>}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'login'
                ? 'Log In'
                : mode === 'signup'
                  ? 'Sign Up'
                  : 'Send Reset Link'}
          </button>
        </form>

        {mode !== 'forgot' && (
          <>
            <div className="login-divider"><span>or</span></div>
            <button type="button" className="login-google-btn" onClick={handleGoogle}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.5 17.7 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
                <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.8-6.1z"/>
                <path fill="#34A853" d="M24 48c6.2 0 11.6-2 15.5-5.6l-7.5-5.8c-2.1 1.4-4.7 2.2-8 2.2-6.3 0-11.7-4-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
              </svg>
              Continue with Google
            </button>
          </>
        )}

        <p className="login-toggle">
          {mode === 'forgot' ? (
            <button type="button" className="login-toggle-btn" onClick={() => switchMode('login')}>
              ← Back to log in
            </button>
          ) : (
            <>
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                className="login-toggle-btn"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              >
                {mode === 'login' ? 'Sign up' : 'Log in'}
              </button>
            </>
          )}
        </p>

        {!returnTo && (
          <p className="login-toggle">
            <button type="button" className="login-toggle-btn" onClick={() => { takeReturnTo(); navigate('/') }}>
              ← Back to home
            </button>
          </p>
        )}

        {returnTo && (
          <p className="login-toggle">
            <button
              type="button"
              className="login-toggle-btn"
              onClick={() => { takeReturnTo(); navigate(returnTo.path) }}
            >
              ← Back to {returnTo.label}
            </button>
          </p>
        )}

        <p className="login-legal">
          By continuing you agree to our <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.
        </p>
      </div>
      </main>
      <LoginAside teacher={teacher} />
    </div>
  )
}

const ASIDE = {
  student: {
    eyebrow: 'Fedge Sanqe · bank exams',
    title: ['Your coaching’s mocks,', 'on your phone.'],
    points: [
      ['The real exam window', 'Sectional timers, question palette and negative marking.'],
      ['Your rank in the batch', 'See where you stand after every mock, the same evening.'],
      ['Free warm-ups', 'The Circle Game and five speed maths drills, open to everyone.'],
    ],
  },
  teacher: {
    eyebrow: 'Fedge Sanqe · coaching portal',
    title: ['Your test series.', 'Your name on it.'],
    points: [
      ['Build mocks', 'Sections, sectional timers, negative marking, Excel / CSV import.'],
      ['Share your code', 'Students join with it and see only your mocks.'],
      ['See every result', 'Scores and ranks for your whole batch.'],
    ],
  },
}

// Right half on wide screens: what the app is for, in three lines.
function LoginAside({ teacher }) {
  const a = ASIDE[teacher ? 'teacher' : 'student']
  return (
    <aside className="login-aside" aria-hidden="true">
      <div>
        <span className="login-aside-eyebrow">{a.eyebrow}</span>
        <h2>{a.title[0]} <em>{a.title[1]}</em></h2>
      </div>
      <ul>
        {a.points.map(([title, text], i) => (
          <li key={title}><span>{i + 1}</span><span><b>{title}</b>{text}</span></li>
        ))}
      </ul>
    </aside>
  )
}
