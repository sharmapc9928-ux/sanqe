import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useApp } from '../lib/appContext'
import { redeemCode } from '../lib/coaching'

export function RedeemCode({ onRedeemed, label = 'Have a code from your coaching?' }) {
  const { refreshHasCourse } = useApp()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const clean = code.replace(/[^a-z0-9]/gi, '')
    if (clean.length < 6 || busy) return
    setBusy(true)
    setError('')
    try {
      const r = await redeemCode(clean)
      setCode('')
      refreshHasCourse()
      onRedeemed(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card redeem-card" onSubmit={submit}>
      <span className="redeem-icon"><KeyRound size={18} /></span>
      <div className="redeem-body">
        <label htmlFor="access-code" className="redeem-label">{label}</label>
        <div className="redeem-row">
          <input
            id="access-code"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
            placeholder="e.g. 48TS642A"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
          />
          <button type="submit" className="btn primary" disabled={busy || code.replace(/[^a-z0-9]/gi, '').length < 6}>
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </div>
        {error && <p className="error small" role="alert">{error}</p>}
      </div>
    </form>
  )
}
