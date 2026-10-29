import { useContext, useState } from 'react'
import { Check, Mail, Send } from 'lucide-react'
import { Page, SiteFooter } from '../components/Layout'
import { AppContext } from '../lib/appContext'
import { linkProps } from '../lib/router'
import { CONTACT_EMAIL, CONTACT_TOPICS, EMAIL_RE, sendContactMessage } from '../lib/contact'

// Contact form (/contact). Opens logged out too; rendered on the server for
// search engines. Messages land in Admin → Messages.
export default function Contact() {
  const app = useContext(AppContext)
  const user = app?.user || null
  const [f, setF] = useState(() => ({
    name: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
    email: user?.email || '',
    phone: '',
    topic: 'general',
    message: '',
    website: '', // honeypot: people never see it, bots fill it in
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError('') }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (f.website) { setSent(true); return }
    if (!f.name.trim()) return setError('Please write your name.')
    if (!EMAIL_RE.test(f.email.trim())) return setError('Please give an email address we can reply to.')
    if (f.message.trim().length < 10) return setError('Please write a little more, at least 10 characters.')
    setBusy(true)
    try {
      await sendContactMessage(f, user?.id)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      title="Contact us"
      subtitle="Questions about the app, your coaching’s portal, or something that isn’t working. We reply by email, usually within two working days."
      className="contact-page"
    >
      {sent ? (
        <section className="card contact-sent" role="status">
          <span className="empty-icon"><Check size={22} /></span>
          <h2>Message sent</h2>
          <p>Thanks{f.name.trim() ? `, ${f.name.trim().split(/\s+/)[0]}` : ''}. We’ll reply to <b>{f.email.trim()}</b>.</p>
          <a className="btn" {...linkProps('/')}>Back to home</a>
        </section>
      ) : (
        <form className="card contact-form" onSubmit={submit} noValidate>
          <div className="contact-row">
            <label className="field">
              <span>Your name</span>
              <input value={f.name} onChange={set('name')} maxLength={80} autoComplete="name" required />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={f.email} onChange={set('email')} maxLength={200} autoComplete="email" required />
            </label>
          </div>
          <div className="contact-row">
            <label className="field">
              <span>Phone <em>(optional)</em></span>
              <input type="tel" value={f.phone} onChange={set('phone')} maxLength={20} autoComplete="tel" inputMode="tel" />
            </label>
            <label className="field">
              <span>About</span>
              <select value={f.topic} onChange={set('topic')}>
                {CONTACT_TOPICS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Message</span>
            <textarea value={f.message} onChange={set('message')} rows={6} maxLength={4000} required />
          </label>
          <label className="contact-hp" aria-hidden="true">
            Website <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
          </label>
          {error && <p className="error small" role="alert">{error}</p>}
          <div className="contact-actions">
            <button type="submit" className="btn primary" disabled={busy}><Send size={15} /> {busy ? 'Sending…' : 'Send message'}</button>
            <span className="muted small">Or email <a href={`mailto:${CONTACT_EMAIL}`}><Mail size={13} /> {CONTACT_EMAIL}</a></span>
          </div>
          <p className="muted small">We use what you send only to reply to you. See our <a href="/privacy.html">privacy policy</a>.</p>
        </form>
      )}
      <SiteFooter />
    </Page>
  )
}
