import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ApiError, isMissingSchema } from './api'
import { TOPIC_BY_KEY, isFreeTopic } from './syllabus'

// Paid access to the Practice section. Prices and lengths live in the
// practice_plans table (the payment functions read them from there too); a
// student's pass comes from practice_payments through my_practice_pass().
//
// Access levels:
//   'none'      free topics only (see FREE_TOPICS_NOTE)
//   'prelims'   every Prelims topic, every mode, explanations, focus timer
//   'full'      the same plus the Mains topics and the Mistake Notebook
//   'checking'  still finding out (never shown as locked)
// A coaching course (hasCourse) and admins count as 'full'.

// The free topics, in words, for the screens that explain the plans. Keep in
// step with FREE_PRACTICE_KEYS in syllabus.js.
export const FREE_TOPICS_NOTE = 'Average, Syllogism and the speed maths drills'

// A plan is not per subject: one plan opens every Prelims topic in all of
// them. GA is hidden for now (see `hidden` in syllabus.js); add it back here
// when it returns. Computer is a Mains subject, so it only comes with a
// Prelims + Mains plan.
export const ALL_SUBJECTS_NOTE = 'Quant, Reasoning and English'

// What each kind of plan includes, for the plans page. `no` = left out;
// `count` is the line printed under the list.
export const TIER_FEATURES = {
  prelims: {
    yes: [`Every Prelims topic in ${ALL_SUBJECTS_NOTE}`, 'Every mode: 15 min, 30 min, 1 hour, Intense, focus sessions', 'Explanations in English and Hinglish', 'Focus timer'],
    no: ['Mains topics', 'Mistake Notebook'],
    count: '5000+ questions',
  },
  full: {
    yes: [`Every Prelims topic in ${ALL_SUBJECTS_NOTE}`, 'Every Mains topic, with harder sets', 'Every mode: 15 min, 30 min, 1 hour, Intense, focus sessions', 'Explanations in English and Hinglish', 'Mistake Notebook and focus timer'],
    no: [],
    count: '8000+ questions',
  },
}

export function accessLevel({ hasCourse, isAdmin, pass }) {
  if (hasCourse || isAdmin || pass?.tier === 'full') return 'full'
  if (pass?.tier === 'prelims') return 'prelims'
  if (hasCourse === null || isAdmin === null || pass === null) return 'checking'
  return 'none'
}

// A paid plan of either kind.
export const isPaid = (access) => access === 'prelims' || access === 'full'

// What a student may do on one topic: 'open' (everything in it), 'none' (a
// plan is needed), 'mains' (they have Prelims, the topic is Mains) or
// 'checking'. The free topics are open to everyone.
export function levelFor(topicKey, access) {
  if (isFreeTopic(topicKey) || access === 'full') return 'open'
  if (access === 'prelims') return TOPIC_BY_KEY[topicKey]?.stage === 'mains' ? 'mains' : 'open'
  return access
}

export const formatRupees = (inr) => `₹${Number(inr).toLocaleString('en-IN')}`

export const formatMonths = (n) => (n === 12 ? '1 year' : `${n} months`)

export const formatPassDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
// { tier: 'full' | 'timed' | null, until: iso | null }. No pass (and no table
// yet, before the migration) is { tier: null }.
export async function fetchMyPracticePass() {
  const { data, error } = await supabase.rpc('my_practice_pass')
  if (error) {
    if (isMissingSchema(error)) return { tier: null, until: null }
    throw new ApiError(error)
  }
  return { tier: data?.tier || null, until: data?.until || null }
}

let plansRequest = null

// Active plans, cheapest first. Empty before the migration. Asked once per
// visit: the same answer is shared by every screen that shows prices.
export function fetchPracticePlans() {
  plansRequest ??= supabase
    .from('practice_plans')
    .select('key, label, tier, amount_inr, months')
    .order('position')
    .then(({ data, error }) => {
      if (error && !isMissingSchema(error)) throw new ApiError(error)
      return data || []
    })
    .catch((e) => { plansRequest = null; throw e })
  return plansRequest
}

// { plans, state }: state is 'loading' | 'ready' | 'error'.
export function usePracticePlans() {
  const [result, setResult] = useState({ plans: [], state: 'loading' })
  useEffect(() => {
    let cancelled = false
    fetchPracticePlans()
      .then((plans) => { if (!cancelled) setResult({ plans, state: 'ready' }) })
      .catch(() => { if (!cancelled) setResult({ plans: [], state: 'error' }) })
    return () => { cancelled = true }
  }, [])
  return result
}
