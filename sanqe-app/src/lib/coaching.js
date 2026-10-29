import { supabase } from '../supabaseClient'
import { ApiError, isMissingSchema, readFunctionError } from './api'
import { uploadImage } from './admin'
import { SECTIONS, isOneClock } from './examLogos'

// Coaching test series: coachings build full-length objective mocks and
// unlock them for their own students with access codes. The database does
// the access checks, timing and scoring (see the coaching_test_series
// migration); students never read the answer key directly.

const INSERT_CHUNK = 100

// Database errors in words a coaching owner can act on. Messages raised by
// our own functions (publish checks etc.) are already readable.
function coachError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return new Error(fallback)
  if (error.code === '42501' && /row-level security|permission denied/i.test(error.message || '')) {
    return new Error('Your coaching account isn’t approved for this yet, or this item isn’t yours.')
  }
  if (error.code === '23514' && /violates check constraint/i.test(error.message || '')) {
    return new Error('A field is empty, too long or out of range. Check the form and try again.')
  }
  if (error.code === '23502') return new Error('A required field is empty.')
  if (error.code === '23505' && /slug/i.test(error.message || '')) return new Error('That page link is taken. Try another one.')
  if (error.code === '23505') return new Error('That already exists.')
  const err = new ApiError(error, fallback)
  return err
}

async function rpc(name, args, fallback) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw coachError(error, fallback)
  return data
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
// Series this student has unlocked, newest first. Empty when the feature
// isn't on the database yet.
export async function fetchMySeries(userId) {
  // Coaching names come from my_coachings() rather than an embed of the
  // coachings table: students no longer read that table (it holds the
  // coaching's phone, referral code and commission).
  const [{ data, error }, coachings] = await Promise.all([
    supabase
      .from('series_enrollments')
      .select('series_id, enrolled_at, test_series(id, title, exam, description, coaching_id, coaching_mocks(count))')
      .eq('user_id', userId)
      .order('enrolled_at', { ascending: false }),
    fetchMyCoachings().catch(() => []),
  ])
  if (error) {
    if (isMissingSchema(error)) return []
    throw new ApiError(error)
  }
  const coachingById = new Map(coachings.map((c) => [c.id, c]))
  // A suspended coaching's series stop showing (RLS returns no series row).
  return (data || []).filter((r) => r.test_series).map((r) => ({
    ...r.test_series,
    enrolled_at: r.enrolled_at,
    coaching: coachingById.get(r.test_series.coaching_id) ?? null,
    mockCount: r.test_series.coaching_mocks?.[0]?.count ?? 0,
  }))
}

// Fedge's own full-length mocks: every logged-in student can take them, and
// no coaching comes with them. Empty until the open_mocks migration is on the
// database.
export async function fetchOpenMocks() {
  const { data, error } = await supabase.rpc('list_open_mocks')
  if (error) {
    if (isMissingSchema(error)) return []
    throw new ApiError(error)
  }
  return data || []
}

// Whether the student has a course: a test series of a coaching whose portal
// plan is running (or one of Fedge's own). Practice, Daily, Mock Tests and Learn
// open only then. The database decides (my_course_access) and enforces the same
// rule on practice_questions and learn_notes; joining one of Fedge's open series
// for free is not a course.
export async function fetchHasCourse(userId) {
  const { data, error } = await supabase.rpc('my_course_access')
  if (!error) return data === true
  if (!isMissingSchema(error)) throw new ApiError(error)

  // The database doesn't have my_course_access yet: count enrolments as before.
  const { count, error: countError } = await supabase
    .from('series_enrollments')
    .select('series_id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (countError) throw new ApiError(countError)
  return (count || 0) > 0
}

// Returns { series_id, title, already }; throws with a readable message.
export async function redeemCode(code) {
  const data = await rpc('redeem_access_code', { p_code: code })
  if (!data?.ok) throw new Error(data?.error || 'This code isn’t valid.')
  return data
}

// Coachings the student has added (referral code) or bought from, newest
// first. Empty when the feature isn't on the database yet.
export async function fetchMyCoachings() {
  const { data, error } = await supabase.rpc('my_coachings')
  if (error) {
    if (isMissingSchema(error)) return []
    throw new ApiError(error)
  }
  return data || []
}

// Returns { id, name, slug, already }; throws with a readable message.
export async function joinCoaching(code) {
  const data = await rpc('join_coaching', { p_code: code })
  if (!data?.ok) throw new Error(data?.error || 'This referral code isn’t valid.')
  return data
}

// A coaching and the series it has on sale (get_coaching_page): { name, slug,
// series: [{ id, title, exam, description, price_inr, mocks, enrolled }] }, or null.
export async function fetchCoachingPage(slug) {
  const { data, error } = await supabase.rpc('get_coaching_page', { p_slug: slug })
  if (error) throw new ApiError(error, 'Could not load this coaching’s courses.')
  return data
}

export const joinFreeSeries = (seriesId) => rpc('join_free_series', { p_series: seriesId }, 'Could not join this test series.')

export const fetchSeries = (seriesId) => rpc('get_series', { p_series: seriesId })
export const startMock = (mockId) => rpc('start_mock', { p_mock: mockId }, 'Could not start the mock.')
// Pause freezes the server clock; the budget is limited per attempt.
export const pauseMock = (attemptId) => rpc('pause_mock', { p_attempt: attemptId }, 'Could not pause the test.')
export const resumeMock = (attemptId) => rpc('resume_mock', { p_attempt: attemptId }, 'Could not resume the test.')
export const fetchMockResult = (mockId) => rpc('get_mock_result', { p_mock: mockId })

export const saveMockProgress = (attemptId, answers, progress) =>
  rpc('save_mock_progress', { p_attempt: attemptId, p_answers: answers, p_progress: progress })

export const submitMock = (attemptId, answers) =>
  rpc('submit_mock', { p_attempt: attemptId, p_answers: answers }, 'Could not submit. Check your connection and try again.')

// ---------------------------------------------------------------------------
// Coaching account
// ---------------------------------------------------------------------------
// The caller's coaching (any status), or null. Undefined-table = null too,
// so the portal just shows the apply form before the migration is applied.
export async function fetchMyCoaching(userId) {
  const { data, error } = await supabase.from('coachings').select('*').eq('owner_id', userId).maybeSingle()
  if (error) {
    if (isMissingSchema(error)) return null
    throw coachError(error)
  }
  return data
}

const coachingFields = (f) => ({
  name: f.name.trim(),
  state: f.state?.trim() || null,
  city: f.city?.trim() || null,
  phone: f.phone?.trim() || null,
  about: f.about?.trim() || null,
  slug: f.slug?.trim() || null,
})

// Students find a coaching's courses through its link, which is no longer a
// page of its own. Every coaching keeps one, made from its name (with a short
// suffix when another coaching has it).
const autoSlug = (name) => {
  const s = slugify(name)
  return isValidSlug(s) ? s : `coaching-${Math.random().toString(36).slice(2, 6)}`
}

async function saveCoaching(run, fields, failMessage) {
  let slug = fields.slug?.trim() || autoSlug(fields.name)
  for (let attempt = 0; ; attempt += 1) {
    const { data, error } = await run({ ...coachingFields(fields), slug })
    if (!error) return data
    const taken = error.code === '23505' && /slug/i.test(`${error.message} ${error.details || ''}`)
    if (!taken || attempt >= 3) throw coachError(error, failMessage)
    slug = `${slug.slice(0, 34).replace(/-+$/, '')}-${Math.random().toString(36).slice(2, 6)}`
  }
}

export const applyCoaching = (fields) =>
  saveCoaching((row) => supabase.from('coachings').insert(row).select().single(), fields, 'Could not send your application.')

export const updateCoaching = (id, fields) =>
  saveCoaching((row) => supabase.from('coachings').update(row).eq('id', id).select().single(), fields)

// ---------------------------------------------------------------------------
// Plans: a coaching pays Fedge (Razorpay) to use the portal
// ---------------------------------------------------------------------------
// Plans switch on once the coaching_plans migration adds paid_until; until
// then every coaching uses the portal as before.
export const plansLive = (coaching) => !!coaching && 'paid_until' in coaching
// Fedge's own coaching (the source of the mock pack) never pays.
export const isPaidUp = (coaching) =>
  !plansLive(coaching) || coaching.is_fedge || (!!coaching.paid_until && new Date(coaching.paid_until) > new Date())

// Every plan includes some Fedge mocks (pack_level 1 to 3) while it is paid up.
export const hasFedgePack = (coaching) => Number(coaching?.pack_level) > 0 && isPaidUp(coaching)

// The cheapest plan that gets a Fedge mock (coaching_mocks.pack_level).
export const PACK_LEVELS = [
  { value: 1, label: 'All plans (Monthly and up)' },
  { value: 2, label: 'Yearly and Pro' },
  { value: 3, label: 'Pro only' },
]

// All plans, inactive ones too (shown as "Coming soon"). Before the Pro
// plan migration the feature columns don't exist yet: the plans then load
// without them.
export async function fetchCoachingPlans() {
  const plans = (cols) => supabase.from('coaching_plans').select(cols).order('position')
  let { data, error } = await plans('key, label, amount_inr, days, active, pack_level, features')
  if (error && isMissingSchema(error)) ({ data, error } = await plans('key, label, amount_inr, days, active'))
  if (error) throw coachError(error)
  return data || []
}

// Copies Fedge mocks published since the last visit (as far as the plan's
// level goes). Returns
// how many were added.
export const syncFedgePack = () => rpc('sync_my_fedge_pack', {}).then((n) => n || 0)

let checkoutScript = null
function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve()
  checkoutScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = resolve
    s.onerror = () => { checkoutScript = null; reject(new Error('Couldn’t load the payment window. Check your connection and try again.')) }
    document.head.appendChild(s)
  })
  return checkoutScript
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Has the verify function confirm a payment. The money is already taken by
// now and verifying is safe to repeat, so a temporary failure (a 5xx from
// Supabase, a dropped connection) is retried a few times before the buyer is
// told anything went wrong.
async function verifyPayment(verifyFn, resp) {
  let failure
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await wait(1500 * attempt)
    const { data, error } = await supabase.functions.invoke(verifyFn, { body: resp })
    if (!error && !data?.error) return data
    failure = new Error(await readFunctionError(error, data, 'Could not confirm the payment.'))
    const temporary = error && (error.name !== 'FunctionsHttpError' || error.context?.status >= 500)
    if (!temporary) break
  }
  throw failure
}

// Creates an order with the given edge function, opens Razorpay Checkout for
// it and, once the buyer has paid, has the verify function confirm the money.
// Resolves with the verify function's reply, or null if the window was closed
// without paying.
async function checkout(orderFn, orderBody, verifyFn, describe) {
  const { data: order, error } = await supabase.functions.invoke(orderFn, { body: orderBody })
  if (error || order?.error) throw new Error(await readFunctionError(error, order, 'Could not start the payment.'))
  await loadRazorpayCheckout()

  return new Promise((resolve, reject) => {
    // A failed attempt keeps the window open for another try; the error is
    // only reported if they then close it.
    let failure = null
    const popup = new window.Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Fedge Sanqe',
      description: describe(order),
      prefill: { email: order.email },
      theme: { color: '#a25a2a' },
      modal: { ondismiss: () => (failure ? reject(failure) : resolve(null)) },
      handler: async (resp) => {
        try {
          resolve(await verifyPayment(verifyFn, resp))
        } catch (e) {
          reject(e)
        }
      },
    })
    popup.on('payment.failed', (r) => { failure = new Error(r?.error?.description || 'The payment failed. No money was taken — try again.') })
    popup.open()
  })
}

// Opens Razorpay Checkout for a plan. Resolves with the new paid_until once
// the server has confirmed the money, or null if the coaching closed the
// window without paying.
export async function payForPlan(planKey) {
  const data = await checkout('coaching-plan-order', { plan: planKey }, 'coaching-plan-verify', (o) => `${o.plan} plan — ${o.coaching}`)
  return data ? data.paid_until : null
}

// Opens Razorpay Checkout for a test series a student is buying. Resolves with
// the series id once the server has confirmed the money and enrolled them, or
// null if they closed the window without paying.
export async function payForSeries(seriesId) {
  const data = await checkout('series-order', { series: seriesId }, 'series-verify', (o) => `${o.title} — ${o.coaching}`)
  return data ? data.series_id : null
}

// Opens Razorpay Checkout for a Practice plan. Resolves with { tier, until }
// once the server has confirmed the money and started the plan, or null if
// the student closed the window without paying.
export async function payForPractice(planKey) {
  const data = await checkout('practice-order', { plan: planKey }, 'practice-verify', (o) => `${o.plan} plan — Practice`)
  return data ? { tier: data.tier, until: data.until } : null
}

// ---------------------------------------------------------------------------
// Fedge passes: Fedge's own mocks, through a coaching or FEDGE All-Access
// ---------------------------------------------------------------------------
// { until, all_until }: end of the student's running pass of either kind, and of
// the All-Access one. Both null without a pass (and before the migration).
export async function fetchMyFedgeAccess() {
  const { data, error } = await supabase.rpc('my_fedge_access')
  if (error) {
    if (isMissingSchema(error)) return { until: null, all_until: null }
    throw new ApiError(error)
  }
  return { until: data?.until || null, all_until: data?.all_until || null }
}

let fedgePlansRequest = null

// { mocks: { amount_inr (the lowest price a coaching may charge), months },
// all: { amount_inr, months, features } }; a key is missing when that plan is
// off or the migration isn't on the database yet. Asked once per visit.
export function fetchFedgePlans() {
  fedgePlansRequest ??= supabase
    .from('fedge_plans')
    .select('key, label, amount_inr, months, features')
    .then(({ data, error }) => {
      if (error && !isMissingSchema(error)) throw new ApiError(error)
      return Object.fromEntries((data || []).map((p) => [p.key, p]))
    })
    .catch((e) => { fedgePlansRequest = null; throw e })
  return fedgePlansRequest
}

// Opens Razorpay Checkout for a Fedge pass: kind 'all' (FEDGE All-Access, from
// Fedge) or 'mocks' (through the coaching with that id, at its price). Resolves
// with { kind, until } once the server has confirmed the money, or null if the
// student closed the window without paying.
export async function payForFedge(kind, coachingId = null) {
  const data = await checkout('fedge-order', { kind, coaching: coachingId }, 'fedge-verify', (o) => (o.coaching ? `${o.plan} — ${o.coaching}` : o.plan))
  return data ? { kind: data.kind, until: data.until } : null
}

// A coaching sets its own price for Fedge mocks; the database refuses anything
// under the floor in fedge_plans.
export async function setFedgePrice(coachingId, price) {
  const { data, error } = await supabase.from('coachings').update({ fedge_price_inr: price }).eq('id', coachingId).select().single()
  if (error) throw coachError(error, 'Could not save the price.')
  return data
}

// What a coaching has sold of Fedge mocks: { sales, gross, share (the
// coaching's cut), owed (not paid out yet) }, or null before the migration.
export async function fetchFedgeSales(coachingId) {
  const { data, error } = await supabase
    .from('fedge_passes')
    .select('amount_inr, coaching_share_inr, payout_status')
    .eq('coaching_id', coachingId)
    .eq('kind', 'mocks')
    .eq('status', 'paid')
    .limit(5000)
  if (error) {
    if (isMissingSchema(error)) return null
    throw coachError(error)
  }
  const rows = data || []
  const sum = (list, key) => list.reduce((n, r) => n + r[key], 0)
  return {
    sales: rows.length,
    gross: sum(rows, 'amount_inr'),
    share: sum(rows, 'coaching_share_inr'),
    owed: sum(rows.filter((r) => r.payout_status === 'pending'), 'coaching_share_inr'),
  }
}

// Whether the migration is on the database (the column comes with it).
export const fedgeLive = (coaching) => !!coaching && 'fedge_price_inr' in coaching

export async function uploadCoachingImage(file, coachingId, mockId) {
  return uploadImage(file, 'coaching-images', `${coachingId}/${mockId}`)
}

// ---------------------------------------------------------------------------
// Test series
// ---------------------------------------------------------------------------
export async function fetchCoachSeriesList(coachingId) {
  const { data, error } = await supabase
    .from('test_series')
    .select('*, coaching_mocks(count), series_enrollments(count)')
    .eq('coaching_id', coachingId)
    .order('created_at', { ascending: false })
  if (error) throw coachError(error)
  return (data || []).map((s) => ({
    ...s,
    mockCount: s.coaching_mocks?.[0]?.count ?? 0,
    studentCount: s.series_enrollments?.[0]?.count ?? 0,
  }))
}

// The series with its coaching's page link and commission.
export async function fetchCoachSeries(seriesId) {
  const { data, error } = await supabase.from('test_series').select('*, coachings(slug, commission_pct)').eq('id', seriesId).maybeSingle()
  if (error) throw coachError(error)
  return data
}

const seriesFields = (f) => ({
  title: f.title.trim(),
  exam: f.exam?.trim() || null,
  description: f.description?.trim() || null,
  price_inr: f.price === '' || f.price == null ? null : Number(f.price),
  on_sale: !!f.onSale,
})

export async function createSeries(coachingId, fields) {
  const { data, error } = await supabase.from('test_series').insert({ coaching_id: coachingId, ...seriesFields(fields) }).select().single()
  if (error) throw coachError(error)
  return data
}

export async function updateSeries(id, fields) {
  const { data, error } = await supabase.from('test_series').update(seriesFields(fields)).eq('id', id).select().single()
  if (error) throw coachError(error)
  return data
}

export async function deleteSeries(id) {
  const { error } = await supabase.from('test_series').delete().eq('id', id)
  if (error) throw coachError(error)
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
export async function fetchSeriesMocks(seriesId) {
  const { data, error } = await supabase
    .from('coaching_mocks')
    .select('id, title, status, published_at, created_at, sectional_timing, duration_sec, mock_sections(id, duration_sec, mock_questions(count)), mock_attempts(count)')
    .eq('series_id', seriesId)
    .order('created_at')
  if (error) throw coachError(error)
  return (data || []).map((m) => ({
    ...m,
    questionCount: (m.mock_sections || []).reduce((n, s) => n + (s.mock_questions?.[0]?.count ?? 0), 0),
    totalSec: m.sectional_timing ? (m.mock_sections || []).reduce((n, s) => n + s.duration_sec, 0) : m.duration_sec,
    attemptCount: m.mock_attempts?.[0]?.count ?? 0,
  }))
}

export async function createMock(seriesId, title) {
  const { data, error } = await supabase.from('coaching_mocks').insert({ series_id: seriesId, title: title.trim() }).select().single()
  if (error) throw coachError(error)
  return data
}

// Every mock of the coaching with its exam, whichever series holds it.
export async function fetchCoachMocks(coachingId) {
  const { data, error } = await supabase
    .from('coaching_mocks')
    .select('id, title, status, published_at, created_at, sectional_timing, duration_sec, test_series!inner(id, exam, coaching_id, source_series_id), mock_sections(id, duration_sec, mock_questions(count)), mock_attempts(count)')
    .eq('test_series.coaching_id', coachingId)
    .order('created_at')
  if (error) throw coachError(error)
  return (data || []).map((m) => ({
    ...m,
    questionCount: (m.mock_sections || []).reduce((n, s) => n + (s.mock_questions?.[0]?.count ?? 0), 0),
    totalSec: m.sectional_timing ? (m.mock_sections || []).reduce((n, s) => n + s.duration_sec, 0) : m.duration_sec,
    attemptCount: m.mock_attempts?.[0]?.count ?? 0,
  }))
}

// A new draft mock under an exam. The portal has no series screen: the mock
// goes into the coaching's series for that exam (one that is open to all
// students first), made on first use. Only an admin can open a series, so for
// anyone else the new series stays closed.
export async function createMockForExam(coachingId, exam, title) {
  const name = exam.trim()
  const { data: found, error } = await supabase
    .from('test_series')
    .select('id')
    .eq('coaching_id', coachingId)
    .ilike('exam', name.replace(/[\\%_]/g, '\\$&'))
    .order('is_open', { ascending: false })
    .order('created_at')
    .limit(1)
  if (error) throw coachError(error)
  let seriesId = found?.[0]?.id
  if (!seriesId) {
    const s = await createSeries(coachingId, { title: name, exam: name, description: '', price: '', onSale: false })
    seriesId = s.id
    await supabase.from('test_series').update({ is_open: true }).eq('id', seriesId)
  }
  return createMock(seriesId, title)
}

// The mock with its series (for the coaching id) and sections in order.
export async function fetchCoachMock(mockId) {
  const { data, error } = await supabase
    .from('coaching_mocks')
    .select('*, test_series(id, title, exam, coaching_id), mock_sections(*), mock_attempts(count)')
    .eq('id', mockId)
    .maybeSingle()
  if (error) throw coachError(error)
  if (!data) return null
  return {
    ...data,
    sections: [...(data.mock_sections || [])].sort((a, b) => a.position - b.position || a.id - b.id),
    attemptCount: data.mock_attempts?.[0]?.count ?? 0,
  }
}

export async function updateMock(id, fields) {
  const { data, error } = await supabase.from('coaching_mocks').update(fields).eq('id', id).select().single()
  if (error) throw coachError(error)
  return data
}

export async function deleteMock(id) {
  const { error } = await supabase.from('coaching_mocks').delete().eq('id', id)
  if (error) throw coachError(error)
}

export async function addSection(mockId, { name, duration_sec, marks_per_question, position }) {
  const { data, error } = await supabase
    .from('mock_sections')
    .insert({ mock_id: mockId, name: name.trim(), duration_sec, marks_per_question, position })
    .select()
    .single()
  if (error) throw coachError(error)
  return data
}

export async function updateSection(id, fields) {
  const { data, error } = await supabase.from('mock_sections').update(fields).eq('id', id).select().single()
  if (error) throw coachError(error)
  return data
}

export async function deleteSection(id) {
  const { error } = await supabase.from('mock_sections').delete().eq('id', id)
  if (error) throw coachError(error)
}

export async function fetchMockQuestions(sectionIds) {
  if (sectionIds.length === 0) return []
  const { data, error } = await supabase
    .from('mock_questions')
    .select('*')
    .in('section_id', sectionIds)
    .order('position')
    .order('id')
    .limit(2000)
  if (error) throw coachError(error)
  return data || []
}

export async function saveMockQuestion(row, id = null) {
  const table = supabase.from('mock_questions')
  const { data, error } = await (id ? table.update(row).eq('id', id) : table.insert(row)).select().single()
  if (error) throw coachError(error, 'Could not save the question.')
  return data
}

export async function deleteMockQuestion(id) {
  const { error } = await supabase.from('mock_questions').delete().eq('id', id)
  if (error) throw coachError(error)
}

// Inserts in chunks; onProgress(done). Stops at the first failed chunk.
export async function insertMockQuestions(rows, onProgress) {
  let done = 0
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK)
    const { error } = await supabase.from('mock_questions').insert(chunk)
    if (error) {
      const err = coachError(error)
      err.message = `${err.message} (${done} of ${rows.length} were saved before this.)`
      throw err
    }
    done += chunk.length
    onProgress?.(done)
  }
  return done
}

export const fetchMockResultsForCoach = (mockId) => rpc('coach_mock_results', { p_mock: mockId }).then((d) => d || [])

// ---------------------------------------------------------------------------
// Access codes and students
// ---------------------------------------------------------------------------
export async function generateCodes(seriesId, { count, maxUses, expiresAt, note }) {
  const data = await rpc('generate_access_codes', {
    p_series: seriesId,
    p_count: count,
    p_max_uses: maxUses,
    p_expires_at: expiresAt || null,
    p_note: note?.trim() || null,
  }, 'Could not make codes.')
  return data || []
}

export async function fetchCodes(seriesId) {
  const { data, error } = await supabase
    .from('series_access_codes')
    .select('*')
    .eq('series_id', seriesId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(5000)
  if (error) throw coachError(error)
  return data || []
}

export async function setCodeRevoked(id, revoked) {
  const { error } = await supabase.from('series_access_codes').update({ revoked }).eq('id', id)
  if (error) throw coachError(error)
}

export async function deleteCode(id) {
  const { error } = await supabase.from('series_access_codes').delete().eq('id', id)
  if (error) throw coachError(error)
}

export const fetchSeriesStudents = (seriesId) => rpc('coach_series_students', { p_series: seriesId }).then((d) => d || [])

export async function removeStudent(seriesId, userId) {
  const { error } = await supabase.from('series_enrollments').delete().match({ series_id: seriesId, user_id: userId })
  if (error) throw coachError(error)
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export async function fetchCoachingApplications() {
  const { data, error } = await supabase.rpc('admin_coachings')
  if (error) {
    if (isMissingSchema(error)) return []
    throw coachError(error)
  }
  return data || []
}

export const setCoachingStatus = (id, status) => rpc('admin_set_coaching_status', { p_coaching: id, p_status: status })

// ---------------------------------------------------------------------------
// Helpers shared by the screens
// ---------------------------------------------------------------------------
// A preset taken from the exam's paper pattern in examLogos.js, so the builder
// and the Mock Tests screen never disagree. Marks per question = section marks
// / section questions. `oneClock` = minutes of the single clock the paper runs
// on (null when each section has its own clock).
const patternPreset = (key, label, slug, stage) => {
  const sections = SECTIONS[slug][stage].map((s) => ({
    name: s.name,
    minutes: s.min,
    marks: Math.round((s.marks / s.q) * 10000) / 10000,
    guide: s.q,
  }))
  return { key, label, sections, oneClock: isOneClock(slug, stage) ? sections.reduce((n, s) => n + s.minutes, 0) : null }
}

// Ready-made section layouts (question counts are just a guide shown to the
// coaching; durations and marks are what the mock uses).
export const SECTION_PRESETS = [
  {
    key: 'ibps_po_pre',
    label: 'IBPS PO Prelims',
    sections: [
      { name: 'English Language', minutes: 20, marks: 1, guide: 30 },
      { name: 'Quantitative Aptitude', minutes: 20, marks: 1, guide: 35 },
      { name: 'Reasoning Ability', minutes: 20, marks: 1, guide: 35 },
    ],
  },
  {
    key: 'sbi_po_pre',
    label: 'SBI PO Prelims',
    sections: [
      { name: 'English Language', minutes: 20, marks: 1, guide: 30 },
      { name: 'Quantitative Aptitude', minutes: 20, marks: 1, guide: 35 },
      { name: 'Reasoning Ability', minutes: 20, marks: 1, guide: 35 },
    ],
  },
  {
    key: 'clerk_pre',
    label: 'IBPS / SBI Clerk Prelims',
    sections: [
      { name: 'English Language', minutes: 20, marks: 1, guide: 30 },
      { name: 'Numerical Ability', minutes: 20, marks: 1, guide: 35 },
      { name: 'Reasoning Ability', minutes: 20, marks: 1, guide: 35 },
    ],
  },
  patternPreset('rrb_pre', 'IBPS RRB PO / Clerk Prelims', 'ibps-rrb-po', 'pre'),
  patternPreset('ibps_po_mains', 'IBPS PO Mains', 'ibps-po', 'mains'),
  patternPreset('ibps_clerk_mains', 'IBPS Clerk Mains', 'ibps-clerk', 'mains'),
  patternPreset('sbi_clerk_mains', 'SBI Clerk Mains', 'sbi-clerk', 'mains'),
  patternPreset('rrb_mains', 'IBPS RRB PO / Clerk Mains', 'ibps-rrb-po', 'mains'),
  {
    key: 'sectional',
    label: 'Single sectional test',
    sections: [{ name: 'Section 1', minutes: 20, marks: 1, guide: 35 }],
  },
]

export const NEGATIVE_MARKS = [
  { value: 0.25, label: '¼ (0.25)' },
  { value: 0.33, label: '⅓ (0.33)' },
  { value: 0.5, label: '½ (0.50)' },
  { value: 0, label: 'None' },
]

// "sharma-coaching-jaipur" from "Sharma Coaching, Jaipur" (page links).
export function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const isValidSlug = (s) => SLUG_RE.test(s) && s.length >= 3 && s.length <= 40

// "Kota, Rajasthan"
export const placeName = (c) => [c?.city, c?.state].filter(Boolean).join(', ')

// "Free" / "₹499"
export const formatPrice = (inr) => (Number(inr) === 0 ? 'Free' : `₹${Number(inr).toLocaleString('en-IN')}`)

export const formatMarks = (n) => {
  const v = Number(n)
  return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '—'
}

// "60 min" / "1 h 30 min"
export function formatMinutes(totalSec) {
  const m = Math.round((Number(totalSec) || 0) / 60)
  if (m < 60) return `${m} min`
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`
}

// A CSV download in the browser.
export function downloadCsv(filename, csvText) {
  const url = URL.createObjectURL(new Blob([csvText], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
