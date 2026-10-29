import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Modal } from './ui'

// 30 "Notionists" avatars (Zoish, via DiceBear, CC0) in public/avatars:
// f01–f15 and m01–m15. The student's pick is saved as `avatar` in their auth
// user_metadata; until they pick one, their id chooses one for them.
const make = (prefix) => Array.from({ length: 15 }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`)
export const AVATAR_GROUPS = [
  { key: 'female', label: 'Female', ids: make('f') },
  { key: 'male', label: 'Male', ids: make('m') },
]
const ALL = AVATAR_GROUPS.flatMap((g) => g.ids)

export const avatarSrc = (id) => `/avatars/${id}.svg`

// The saved pick, or the same default for the same user every time.
export function avatarIdFor(user) {
  const saved = user?.user_metadata?.avatar
  if (ALL.includes(saved)) return saved
  const id = user?.id || ''
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return ALL[h % ALL.length]
}

export function Avatar({ user, id, size = 72, className = '' }) {
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size }}>
      <img src={avatarSrc(id || avatarIdFor(user))} alt="" width={size} height={size} />
    </span>
  )
}

export async function saveAvatar(id) {
  const { error } = await supabase.auth.updateUser({ data: { avatar: id } })
  if (error) throw new Error(error.message || 'Could not save your avatar.')
}

// Grid of all 30, in Female / Male tabs. Saving updates the auth user, which
// the app picks up from the auth listener.
export function AvatarPicker({ open, onClose, user }) {
  const current = avatarIdFor(user)
  const [picked, setPicked] = useState(current)
  const [tab, setTab] = useState(current.startsWith('m') ? 'male' : 'female')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wasOpen, setWasOpen] = useState(open)

  // Start from the saved avatar each time the picker opens.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPicked(current)
      setTab(current.startsWith('m') ? 'male' : 'female')
      setError('')
      setBusy(false)
    }
  }

  const save = async () => {
    if (picked === current) { onClose(); return }
    setBusy(true)
    setError('')
    try {
      await saveAvatar(picked)
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const group = AVATAR_GROUPS.find((g) => g.key === tab)
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      title="Choose your avatar"
      actions={(
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save avatar'}</button>
        </>
      )}
    >
      <div className="avatar-picker-top">
        <Avatar id={picked} size={64} className="avatar-picker-current" />
        <div className="segmented small" role="tablist" aria-label="Avatar group">
          {AVATAR_GROUPS.map((g) => (
            <button key={g.key} type="button" role="tab" aria-selected={tab === g.key} className={tab === g.key ? 'active' : ''} onClick={() => setTab(g.key)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="avatar-grid" role="radiogroup" aria-label={`${group.label} avatars`}>
        {group.ids.map((id, i) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={picked === id}
            aria-label={`${group.label} avatar ${i + 1}`}
            className={`avatar-option${picked === id ? ' on' : ''}`}
            onClick={() => setPicked(id)}
          >
            <img src={avatarSrc(id)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {error && <p className="error small" role="alert">{error}</p>}
    </Modal>
  )
}
