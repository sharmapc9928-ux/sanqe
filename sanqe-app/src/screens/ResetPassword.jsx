import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { LogoMark } from '../components/Logo'

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <div className="login-shell">
      <main className="login-main">
      <div className="login-card">
        <div className="login-brand">
          <LogoMark size={32} />
          <span className="logo-word">Sanqe</span>
        </div>
        <h1 className="login-title">Set a new <em>password.</em></h1>
        <p className="login-sub">Choose a new password for your account.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="reset-confirm">Confirm password</label>
            <input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={6}
              required
            />
          </div>

          {error && <p className="login-error">⚠ {error}</p>}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : 'Update Password'}
          </button>
        </form>
      </div>
      </main>
    </div>
  )
}
