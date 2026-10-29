import { useEffect, useState } from 'react'
import { Check, FileCheck2, Upload } from 'lucide-react'
import { Page } from '../components/Layout'
import { SkeletonCards } from '../components/ui'
import { useApp } from '../lib/appContext'
import { INDIA_STATES } from '../content/indiaDistricts'
import {
  ACCOUNT_RE, BUSINESS_TYPES, EMAIL_RE, FEDGE_STATE, fetchMyPartnerApplication, GSTIN_RE, IFSC_RE, MOBILE_RE, PAN_RE,
  PARTNER_EXAMS, PARTNER_PLANS, PartnerNotReady, PINCODE_RE, savePartnerApplication, SUBDOMAIN_RE, uploadPartnerFile,
} from '../lib/partner'

const SUBDOMAIN_SUFFIX = '.fedge.in'

// Every form field as a string or flag, from a saved row (or empty).
function toForm(row, user) {
  const s = (v) => (v === null || v === undefined ? '' : String(v))
  return {
    legal_name: s(row?.legal_name), brand_name: s(row?.brand_name), business_type: s(row?.business_type),
    gstin: s(row?.gstin), pan: s(row?.pan), billing_address: s(row?.billing_address), billing_state: s(row?.billing_state),
    billing_pincode: s(row?.billing_pincode),
    owner_name: s(row?.owner_name) || user?.user_metadata?.full_name || '', owner_phone: s(row?.owner_phone),
    owner_email: s(row?.owner_email) || user?.email || '', admin_name: s(row?.admin_name), admin_whatsapp: s(row?.admin_whatsapp),
    accounts_email: s(row?.accounts_email),
    logo_path: s(row?.logo_path), brand_colors: s(row?.brand_colors), subdomain: s(row?.subdomain), tagline: s(row?.tagline),
    about: s(row?.about), faculty: s(row?.faculty), faculty_photo_paths: row?.faculty_photo_paths || [], student_address: s(row?.student_address), student_phone: s(row?.student_phone),
    maps_url: s(row?.maps_url), instagram_url: s(row?.instagram_url), youtube_url: s(row?.youtube_url), telegram_url: s(row?.telegram_url),
    plan: s(row?.plan), start_date: s(row?.start_date), billing_day: s(row?.billing_day), student_price_inr: s(row?.student_price_inr),
    student_billing: s(row?.student_billing), bank_account_name: s(row?.bank_account_name), bank_account_number: s(row?.bank_account_number),
    bank_ifsc: s(row?.bank_ifsc), bank_proof_path: s(row?.bank_proof_path),
    exams: row?.exams || [], student_count: s(row?.student_count), batches: s(row?.batches), own_content: !!row?.own_content,
    admin_logins: s(row?.admin_logins), zoom_needed: !!row?.zoom_needed,
    agreed: !!row?.agreed_at,
  }
}

const text = (v) => v.trim() || null
const upper = (v) => v.trim().toUpperCase() || null
const int = (v) => (v.trim() === '' ? null : Number(v))

function toRow(f) {
  return {
    legal_name: f.legal_name.trim(), brand_name: f.brand_name.trim(), business_type: f.business_type,
    gstin: upper(f.gstin), pan: upper(f.pan), billing_address: f.billing_address.trim(), billing_state: f.billing_state,
    billing_pincode: text(f.billing_pincode),
    owner_name: f.owner_name.trim(), owner_phone: f.owner_phone.trim(), owner_email: f.owner_email.trim(),
    admin_name: text(f.admin_name), admin_whatsapp: text(f.admin_whatsapp), accounts_email: text(f.accounts_email),
    logo_path: text(f.logo_path), brand_colors: text(f.brand_colors), subdomain: text(f.subdomain.toLowerCase()),
    tagline: text(f.tagline), about: text(f.about), faculty: text(f.faculty), faculty_photo_paths: f.faculty_photo_paths, student_address: text(f.student_address),
    student_phone: text(f.student_phone), maps_url: text(f.maps_url), instagram_url: text(f.instagram_url),
    youtube_url: text(f.youtube_url), telegram_url: text(f.telegram_url),
    plan: f.plan, start_date: f.start_date || null, billing_day: int(f.billing_day), student_price_inr: int(f.student_price_inr),
    student_billing: f.student_billing || null, bank_account_name: f.bank_account_name.trim(),
    bank_account_number: f.bank_account_number.trim(), bank_ifsc: f.bank_ifsc.trim().toUpperCase(), bank_proof_path: text(f.bank_proof_path),
    exams: f.exams, student_count: int(f.student_count), batches: text(f.batches), own_content: f.own_content,
    admin_logins: int(f.admin_logins), zoom_needed: f.zoom_needed,
  }
}

// The first problem with the form, or ''.
function check(f) {
  const r = toRow(f)
  if (r.legal_name.length < 2) return 'Enter the legal name as on your PAN or GST.'
  if (r.brand_name.length < 2) return 'Enter the brand name students know you by.'
  if (!r.business_type) return 'Choose your business type.'
  if (!r.gstin && !r.pan) return 'Enter your GSTIN, or your PAN if you aren’t GST registered.'
  if (r.gstin && !GSTIN_RE.test(r.gstin)) return 'The GSTIN should be 15 characters, like 08ABCDE1234F1Z5.'
  if (r.pan && !PAN_RE.test(r.pan)) return 'The PAN should be 10 characters, like ABCDE1234F.'
  if (r.gstin && r.pan && r.gstin.slice(2, 12) !== r.pan) return 'The PAN doesn’t match the one inside your GSTIN (characters 3 to 12).'
  if (r.billing_address.length < 5) return 'Enter the billing address.'
  if (!r.billing_state) return 'Choose the billing state.'
  if (r.billing_pincode && !PINCODE_RE.test(r.billing_pincode)) return 'The PIN code should be 6 digits.'
  if (r.owner_name.length < 2) return 'Enter the owner or director’s name.'
  if (!MOBILE_RE.test(r.owner_phone)) return 'Enter the owner’s 10-digit mobile number.'
  if (!EMAIL_RE.test(r.owner_email)) return 'Enter the owner’s email.'
  if (r.admin_whatsapp && !MOBILE_RE.test(r.admin_whatsapp)) return 'The admin’s WhatsApp should be a 10-digit mobile number.'
  if (r.accounts_email && !EMAIL_RE.test(r.accounts_email)) return 'Check the accounts email.'
  if (r.subdomain && !SUBDOMAIN_RE.test(r.subdomain)) return 'The subdomain can use 3 to 30 letters, numbers and dashes, like successpoint.'
  if (!r.plan) return 'Choose a plan.'
  if (r.billing_day !== null && !(r.billing_day >= 1 && r.billing_day <= 28)) return 'The billing date should be between 1 and 28.'
  if (r.bank_account_name.length < 2) return 'Enter the bank account holder’s name.'
  if (!ACCOUNT_RE.test(r.bank_account_number)) return 'The account number should be 9 to 18 digits.'
  if (f.bank_account_number.trim() !== f.bank_account_confirm?.trim() && !f.bankConfirmed) return 'The two account numbers don’t match.'
  if (!IFSC_RE.test(r.bank_ifsc)) return 'The IFSC should be 11 characters, like SBIN0001234.'
  if (!f.agreed) return 'Tick the agreement box at the end.'
  return ''
}

export default function PartnerApply() {
  const { user } = useApp()
  const [row, setRow] = useState(undefined) // undefined = loading
  const [f, setF] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchMyPartnerApplication(user.id)
      .then((r) => {
        if (cancelled) return
        setRow(r)
        // A saved account number was already confirmed when it was sent.
        setF({ ...toForm(r, user), bank_account_confirm: r?.bank_account_number || '', bankConfirmed: !!r })
      })
      .catch((e) => {
        if (cancelled) return
        setLoadError(e.message)
        setRow(e instanceof PartnerNotReady ? null : undefined)
      })
    return () => { cancelled = true }
  }, [user])

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setF((x) => ({ ...x, [k]: v, ...(k === 'bank_account_number' ? { bankConfirmed: false } : {}) }))
    setError('')
    setSent(false)
  }
  const toggleExam = (exam) => {
    setF((x) => ({ ...x, exams: x.exams.includes(exam) ? x.exams.filter((e) => e !== exam) : [...x.exams, exam] }))
    setSent(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    const problem = check(f)
    if (problem) { setError(problem); return }
    setBusy(true)
    setError('')
    try {
      const saved = await savePartnerApplication({ ...toRow(f), agreed_at: row?.agreed_at || new Date().toISOString() }, row?.id)
      setRow(saved)
      setF((x) => ({ ...x, bankConfirmed: true }))
      setSent(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const locked = !!row && row.status !== 'new'

  return (
    <Page
      title="Become a partner"
      subtitle="Your own branded mock test site for your students. Fill this once; Fedge calls you within 2 working days and sends the agreement."
      backTo="/coach"
      className="partner-page"
    >
      {loadError && <p className="error" role="alert">{loadError}</p>}
      {row === undefined && !loadError && <SkeletonCards count={2} height={260} />}
      {sent && <p className="admin-notice partner-sent" role="status"><Check size={16} /> Details sent. Fedge will contact you soon. You can still edit them below.</p>}
      {row && !sent && (
        <p className="admin-hint partner-status">
          {locked
            ? <>Your application is <b>{row.status}</b>. To change anything now, contact Fedge.</>
            : <>Application received. Fedge will contact you soon. You can edit it below until then.</>}
        </p>
      )}
      {f && !locked && (
        <form className="partner-form" onSubmit={submit} noValidate>
          <p className="partner-privacy">
            Only you and Fedge can see these details. We ask only for what your invoice and payouts need: never your Aadhaar
            or personal bank details.
          </p>
          <Section n={1} title="Business and GST details" note="Used for your invoice.">
            <Field label="Legal name" hint="Printed on your invoice. Exactly as on your PAN or GST certificate">
              <input value={f.legal_name} onChange={set('legal_name')} maxLength={120} autoComplete="organization" />
            </Field>
            <Field label="Brand name" hint="Shown on your website and app, e.g. Success Point Academy">
              <input value={f.brand_name} onChange={set('brand_name')} maxLength={80} />
            </Field>
            <Field label="Business type" hint="For our records and the agreement">
              <select value={f.business_type} onChange={set('business_type')}>
                <option value="" disabled>Choose</option>
                {BUSINESS_TYPES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </Field>
            <div className="coach-form-row">
              <Field label="GSTIN" hint="If GST registered, so you can claim ITC">
                <input value={f.gstin} onChange={set('gstin')} maxLength={15} autoCapitalize="characters" spellCheck={false} className="upper" placeholder="08ABCDE1234F1Z5" />
              </Field>
              <Field label="PAN" hint={f.gstin.trim() ? 'Optional with a GSTIN' : 'Needed without GST: for identity and TDS'}>
                <input value={f.pan} onChange={set('pan')} maxLength={10} autoCapitalize="characters" spellCheck={false} className="upper" placeholder="ABCDE1234F" />
              </Field>
            </div>
            <p className="admin-hint">Check your GSTIN on <a href="https://services.gst.gov.in/services/searchtp" target="_blank" rel="noopener noreferrer">gst.gov.in → Search Taxpayer</a>: the name should match and the status should be Active.</p>
            <Field label="Billing address" hint="Decides the GST on your invoice">
              <textarea rows={2} value={f.billing_address} onChange={set('billing_address')} maxLength={400} autoComplete="street-address" />
            </Field>
            <div className="coach-form-row">
              <Field label="Billing state">
                <select value={f.billing_state} onChange={set('billing_state')}>
                  <option value="" disabled>Choose your state</option>
                  {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="PIN code" optional>
                <input value={f.billing_pincode} onChange={set('billing_pincode')} maxLength={6} inputMode="numeric" autoComplete="postal-code" />
              </Field>
            </div>
            {f.billing_state && (
              <p className="partner-tax">
                {f.billing_state === FEDGE_STATE
                  ? <>Same state as Fedge ({FEDGE_STATE}): your invoice will show <b>9% CGST + 9% SGST</b>.</>
                  : <>Different state from Fedge ({FEDGE_STATE}): your invoice will show <b>18% IGST</b>.</>}
                {' '}Pick the state on your GST registration, or the invoice will be wrong.
              </p>
            )}
          </Section>

          <Section n={2} title="Contact details">
            <div className="coach-form-row">
              <Field label="Owner / director name"><input value={f.owner_name} onChange={set('owner_name')} maxLength={80} autoComplete="name" /></Field>
              <Field label="Owner phone"><input value={f.owner_phone} onChange={set('owner_phone')} maxLength={10} inputMode="numeric" autoComplete="tel-national" placeholder="9876543210" /></Field>
            </div>
            <Field label="Owner email"><input type="email" value={f.owner_email} onChange={set('owner_email')} maxLength={120} autoComplete="email" /></Field>
            <div className="coach-form-row">
              <Field label="Admin person" hint="For day-to-day work" optional><input value={f.admin_name} onChange={set('admin_name')} maxLength={80} /></Field>
              <Field label="Admin WhatsApp" optional><input value={f.admin_whatsapp} onChange={set('admin_whatsapp')} maxLength={10} inputMode="numeric" /></Field>
            </div>
            <Field label="Accounts email" hint="Where invoices go, if not the owner’s email" optional>
              <input type="email" value={f.accounts_email} onChange={set('accounts_email')} maxLength={120} />
            </Field>
          </Section>

          <Section n={3} title="Branding" note="For your own site.">
            <FileField
              label="Logo" hint="High-quality PNG or SVG with a transparent background" kind="logo" accept="image/png,image/svg+xml,image/webp,image/jpeg"
              userId={user.id} value={f.logo_path} onChange={(p) => { setF((x) => ({ ...x, logo_path: p })); setSent(false) }}
            />
            <Field label="Subdomain you’d like" optional>
              <span className="coach-slug">
                <input value={f.subdomain} onChange={(e) => { set('subdomain')({ target: { value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') } }) }} maxLength={30} placeholder="successpoint" autoCapitalize="none" spellCheck={false} />
                <span className="coach-slug-prefix">{SUBDOMAIN_SUFFIX}</span>
              </span>
            </Field>
            <div className="coach-form-row">
              <Field label="Brand colours" optional><input value={f.brand_colors} onChange={set('brand_colors')} maxLength={100} placeholder="#0A5C3E, gold" /></Field>
              <Field label="Tagline" optional><input value={f.tagline} onChange={set('tagline')} maxLength={120} /></Field>
            </div>
            <Field label="About your coaching" optional><textarea rows={3} value={f.about} onChange={set('about')} maxLength={1500} /></Field>
            <Field label="Faculty" hint="Names and subjects" optional><textarea rows={2} value={f.faculty} onChange={set('faculty')} maxLength={1500} /></Field>
            <PhotosField userId={user.id} value={f.faculty_photo_paths} onChange={(paths) => { setF((x) => ({ ...x, faculty_photo_paths: paths })); setSent(false) }} />
            <Field label="Address for students" optional><textarea rows={2} value={f.student_address} onChange={set('student_address')} maxLength={400} /></Field>
            <div className="coach-form-row">
              <Field label="Contact number for students" optional><input value={f.student_phone} onChange={set('student_phone')} maxLength={20} inputMode="tel" /></Field>
              <Field label="Google Maps link" optional><input type="url" value={f.maps_url} onChange={set('maps_url')} maxLength={500} /></Field>
            </div>
            <div className="coach-form-row">
              <Field label="Instagram" optional><input type="url" value={f.instagram_url} onChange={set('instagram_url')} maxLength={300} /></Field>
              <Field label="YouTube" optional><input type="url" value={f.youtube_url} onChange={set('youtube_url')} maxLength={300} /></Field>
              <Field label="Telegram" optional><input type="url" value={f.telegram_url} onChange={set('telegram_url')} maxLength={300} /></Field>
            </div>
          </Section>

          <Section n={4} title="Plan and payments">
            <div className="partner-plans" role="radiogroup" aria-label="Plan">
              {PARTNER_PLANS.map((p) => (
                <label key={p.key} className={`partner-plan${f.plan === p.key ? ' active' : ''}`}>
                  <input type="radio" name="plan" value={p.key} checked={f.plan === p.key} onChange={set('plan')} />
                  <span>{p.label}</span>
                  <b>{p.price}</b>
                </label>
              ))}
            </div>
            <div className="coach-form-row">
              <Field label="Start date" optional><input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
              <Field label="Billing date each month" hint="1 to 28" optional><input type="number" min={1} max={28} value={f.billing_day} onChange={set('billing_day')} inputMode="numeric" placeholder="5" /></Field>
            </div>
            <div className="coach-form-row">
              <Field label="Price for students (₹)" optional><input type="number" min={0} max={100000} value={f.student_price_inr} onChange={set('student_price_inr')} inputMode="numeric" placeholder="299" /></Field>
              <Field label="Students pay" optional>
                <select value={f.student_billing} onChange={set('student_billing')}>
                  <option value="">Choose</option>
                  <option value="monthly">Every month</option>
                  <option value="one_time">One time</option>
                </select>
              </Field>
            </div>
            <h3 className="partner-sub">Bank account for your 80% share</h3>
            <Field label="Account holder name" hint="Should match your business name">
              <input value={f.bank_account_name} onChange={set('bank_account_name')} maxLength={120} />
            </Field>
            <div className="coach-form-row">
              <Field label="Account number"><input value={f.bank_account_number} onChange={set('bank_account_number')} maxLength={18} inputMode="numeric" autoComplete="off" /></Field>
              {!f.bankConfirmed && (
                <Field label="Re-enter account number"><input value={f.bank_account_confirm} onChange={set('bank_account_confirm')} maxLength={18} inputMode="numeric" autoComplete="off" onPaste={(e) => e.preventDefault()} /></Field>
              )}
              <Field label="IFSC"><input value={f.bank_ifsc} onChange={set('bank_ifsc')} maxLength={11} autoCapitalize="characters" spellCheck={false} className="upper" placeholder="SBIN0001234" /></Field>
            </div>
            <FileField
              label="Cancelled cheque or bank statement" hint="Photo or PDF, up to 5 MB" kind="bank-proof" accept="image/png,image/jpeg,image/webp,application/pdf"
              userId={user.id} value={f.bank_proof_path} onChange={(p) => { setF((x) => ({ ...x, bank_proof_path: p })); setSent(false) }}
            />
            <p className="admin-hint">Before the first payout, Fedge sends ₹1 to this account to check it.</p>
          </Section>

          <Section n={5} title="Operations">
            <fieldset className="partner-exams">
              <legend>Exams you prepare students for</legend>
              {PARTNER_EXAMS.map((exam) => (
                <label key={exam} className={`chip-check${f.exams.includes(exam) ? ' active' : ''}`}>
                  <input type="checkbox" checked={f.exams.includes(exam)} onChange={() => toggleExam(exam)} />
                  {exam}
                </label>
              ))}
            </fieldset>
            <div className="coach-form-row">
              <Field label="About how many students" optional><input type="number" min={0} value={f.student_count} onChange={set('student_count')} inputMode="numeric" /></Field>
              <Field label="Admin logins needed" optional><input type="number" min={1} max={50} value={f.admin_logins} onChange={set('admin_logins')} inputMode="numeric" placeholder="1" /></Field>
            </div>
            <Field label="Batch names" optional><input value={f.batches} onChange={set('batches')} maxLength={500} placeholder="Morning PO batch, Clerk weekend batch" /></Field>
            <label className="coach-check partner-check">
              <input type="checkbox" checked={f.own_content} onChange={set('own_content')} />
              <span>We want to upload our own notes and mocks</span>
            </label>
            <label className="coach-check partner-check">
              <input type="checkbox" checked={f.zoom_needed} onChange={set('zoom_needed')} />
              <span>We need a Zoom link for interview prep</span>
            </label>
          </Section>

          <section className="card partner-section partner-agreement">
            <h2>Service agreement</h2>
            <p>Before you go live, Fedge sends a short 2–3 page agreement to sign. It covers:</p>
            <ul>
              <li>Your plan, its price, the payment due date and the late payment rule</li>
              <li>How Fedge’s 20% revenue share is worked out and when it’s settled</li>
              <li>The payment gateway fee, which the coaching pays</li>
              <li>Content: Fedge’s content stays Fedge’s, your own content stays yours</li>
              <li>Who can use your students’ data</li>
              <li>Refunds, and the notice period to end the agreement</li>
            </ul>
            <label className="coach-check partner-check">
              <input type="checkbox" checked={f.agreed} onChange={set('agreed')} />
              <span>The details above are correct, and I’ll sign the service agreement Fedge sends.</span>
            </label>
          </section>

          {error && <p className="error" role="alert">{error}</p>}
          <div className="admin-actions partner-actions">
            <button type="submit" className="btn primary big" disabled={busy}>{busy ? 'Sending…' : row ? 'Save changes' : 'Send details'}</button>
          </div>
        </form>
      )}
    </Page>
  )
}

function Section({ n, title, note, children }) {
  return (
    <section className="card admin-form partner-section">
      <h2><span className="partner-n">{n}</span>{title}{note && <em>{note}</em>}</h2>
      {children}
    </section>
  )
}

function Field({ label, hint, optional, children }) {
  return (
    <label className="field">
      <span>{label}{optional && <em> (optional)</em>}{hint && <em> · {hint}</em>}</span>
      {children}
    </label>
  )
}

const MAX_PHOTOS = 10

// Faculty photos: up to ten pictures, added a few at a time.
function PhotosField({ userId, value, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pick = async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX_PHOTOS - value.length)
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    setError('')
    try {
      const paths = []
      for (const file of files) paths.push(await uploadPartnerFile(file, userId, 'faculty'))
      onChange([...value, ...paths])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="field partner-file">
      <span>Faculty photos <em>(optional) · up to {MAX_PHOTOS}, PNG or JPG</em></span>
      <div className="partner-photos">
        {value.length > 0 && <span className="partner-photo-count"><FileCheck2 size={15} /> {value.length} uploaded</span>}
        {value.length < MAX_PHOTOS && (
          <label className="btn small">
            <Upload size={15} /> {busy ? 'Uploading…' : value.length ? 'Add more' : 'Upload photos'}
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={pick} disabled={busy} hidden />
          </label>
        )}
        {value.length > 0 && <button type="button" className="link-btn" onClick={() => onChange([])}>Remove all</button>}
      </div>
      {error && <p className="error small" role="alert">{error}</p>}
    </div>
  )
}

function FileField({ label, hint, kind, accept, userId, value, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      onChange(await uploadPartnerFile(file, userId, kind))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="field partner-file">
      <span>{label} <em>(optional) · {hint}</em></span>
      <label className={`btn small${value ? ' ghost' : ''}`}>
        {value ? <FileCheck2 size={15} /> : <Upload size={15} />}
        {busy ? 'Uploading…' : value ? 'Uploaded · replace' : 'Upload file'}
        <input type="file" accept={accept} onChange={pick} disabled={busy} hidden />
      </label>
      {error && <p className="error small" role="alert">{error}</p>}
    </div>
  )
}
