import { useState } from 'react'
import { PartyPopper, Target } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useApp } from '../lib/appContext'
import { DREAM_JOBS } from '../components/dreamJobs'

export default function DreamJobPrompt({ onDone }) {
  const { user } = useApp()
  const [selected, setSelected] = useState('')
  const [customJob, setCustomJob] = useState('')
  const [step, setStep] = useState('ask') // 'ask' | 'thanks'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const finalJob = selected === 'other' ? customJob.trim() : selected
  const canConfirm = selected && (selected !== 'other' || customJob.trim().length > 0)

  const handleConfirm = async () => {
    if (!canConfirm || saving) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('dream_jobs').insert({
      user_id: user.id,
      email: user.email,
      dream_job: finalJob,
    })
    setSaving(false)
    // 23505 = unique_violation — this user already has a row (e.g. a second
    // tab got there first); the goal is on file either way, so carry on.
    if (err && err.code !== '23505') {
      setError(err.message)
      return
    }
    setStep('thanks')
  }

  if (step === 'thanks') {
    return (
      <main className="page center">
        <div className="card dreamjob-card dreamjob-thanks">
          <span className="dreamjob-icon"><PartyPopper size={34} /></span>
          <h1>All the best for {finalJob}!</h1>
          <p className="dreamjob-sub">Goal noted. Your dashboard will track your speed and accuracy topic by topic, so you always know what to work on next.</p>
          <button type="button" className="btn primary big" onClick={onDone}>Let&apos;s start →</button>
        </div>
      </main>
    )
  }

  return (
    <main className="page center">
      <div className="card dreamjob-card">
        <span className="dreamjob-icon"><Target size={32} /></span>
        <h1>What&apos;s your target exam?</h1>
        <p className="dreamjob-sub">Pick the exam you&apos;re preparing for. You can change it later from your profile.</p>

        {DREAM_JOBS.map((group) => (
          <div className="dreamjob-group" key={group.group}>
            <div className="dreamjob-group-label">{group.group}</div>
            <div className="dreamjob-grid">
              {group.items.map((job) => (
                <button
                  key={job}
                  type="button"
                  aria-pressed={selected === job}
                  className={`dreamjob-option${selected === job ? ' active' : ''}`}
                  onClick={() => setSelected(job)}
                >
                  {job}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="dreamjob-group">
          <label className="dreamjob-group-label" htmlFor="dreamjob-other">Something else</label>
          <input
            id="dreamjob-other"
            type="text"
            className="dreamjob-other-input"
            placeholder="Type your target exam"
            value={customJob}
            onChange={(e) => { setCustomJob(e.target.value); setSelected('other') }}
            onFocus={() => setSelected('other')}
            maxLength={80}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <button type="button" className="btn primary big dreamjob-confirm" disabled={!canConfirm || saving} onClick={handleConfirm}>
          {saving ? 'Saving…' : 'Confirm →'}
        </button>
      </div>
    </main>
  )
}
