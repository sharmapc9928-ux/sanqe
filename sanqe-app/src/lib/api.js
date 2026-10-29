import { supabase } from '../supabaseClient'
import { TOPIC_BY_KEY } from './syllabus'

// Errors that mean "this table / column / function hasn't been created on
// the database yet" (i.e. a migration hasn't been applied). Features built on
// them switch themselves off instead of breaking the app.
const MISSING_SCHEMA_CODES = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'])
export const isMissingSchema = (error) => !!error && MISSING_SCHEMA_CODES.has(error.code)

export class ApiError extends Error {
  constructor(error, fallback = 'Something went wrong. Please try again.') {
    super(error?.message || fallback)
    this.code = error?.code
    this.missingSchema = isMissingSchema(error)
  }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

// ---------------------------------------------------------------------------
// Practice questions
// ---------------------------------------------------------------------------
// The five original quant topics have their own tables; every other topic's
// questions live in the shared practice_questions table.
const SHARED_TABLE = 'practice_questions'
const QUESTION_COLUMNS = 'id, passage, image_url, question, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, explanation_hi'

function questionQuery(topic) {
  if (topic.table) return supabase.from(topic.table).select('*')
  return supabase.from(SHARED_TABLE).select(QUESTION_COLUMNS).eq('topic', topic.key)
}

export async function fetchQuestions(topicKey) {
  const topic = TOPIC_BY_KEY[topicKey]
  if (!topic) throw new Error('Unknown topic.')
  const { data, error } = await questionQuery(topic).order('id')
  if (error) {
    // Shared table not created yet = no questions in this topic yet.
    if (!topic.table && isMissingSchema(error)) return []
    throw new ApiError(error, isOffline() ? "You're offline and these questions aren't saved on this device yet." : undefined)
  }
  return data || []
}

export async function fetchQuestionsByIds(topicKey, ids) {
  const topic = TOPIC_BY_KEY[topicKey]
  if (!topic || ids.length === 0) return []
  const { data, error } = await questionQuery(topic).in('id', ids)
  if (error) throw new ApiError(error)
  return data || []
}

// { topicKey: number of questions }. Empty object if the counts function
// isn't on the database yet (screens then just don't show counts).
export async function fetchTopicCounts() {
  const { data, error } = await supabase.rpc('practice_topic_counts')
  if (error) {
    if (isMissingSchema(error)) return null
    throw new ApiError(error)
  }
  return Object.fromEntries((data || []).map((r) => [r.topic, Number(r.questions) || 0]))
}

// Fire-and-forget: a failed save must never interrupt a running test.
export function recordAttempt({ topic, questionId, selected, timeMs, mode }) {
  return supabase
    .from('question_attempts')
    .insert({
      topic,
      question_id: questionId,
      selected_option: selected || null,
      time_ms: Math.max(0, Math.min(3600000, Math.round(timeMs))),
      mode,
    })
    .then(({ error }) => {
      if (error && !isMissingSchema(error)) console.debug('Attempt not saved:', error.message)
    })
}

export function saveSession(summary) {
  return supabase
    .from('practice_sessions')
    .insert(summary)
    .then(({ error }) => {
      if (error && !isMissingSchema(error)) console.debug('Session not saved:', error.message)
    })
}

export async function fetchStats() {
  const { data, error } = await supabase.rpc('get_my_stats')
  if (error) throw new ApiError(error)
  return data
}

// "Report this question". Returns 'sent', or 'already' when this account
// has reported the question before (one report per student per question).
export async function reportQuestion({ topic, questionId, reason, note }) {
  const { error } = await supabase.from('question_reports').insert({
    topic,
    question_id: questionId,
    reason,
    note: note?.trim() ? note.trim().slice(0, 500) : null,
  })
  if (!error) return 'sent'
  if (error.code === '23505') return 'already'
  throw new ApiError(error, isOffline() ? "You're offline. Try again when you're connected." : undefined)
}

// ---------------------------------------------------------------------------
// Learn notes
// ---------------------------------------------------------------------------
// Bilingual revision notes edited in the learn_notes table. Empty list when
// the topic has none (or the table isn't on the database yet); the Learn
// screen then falls back to the notes bundled with the app.
export async function fetchLearnNotes(topicKey) {
  const { data, error } = await supabase
    .from('learn_notes')
    .select('id, position, kind, title, title_hi, body, body_hi, working, tip, tip_hi, answer, level')
    .eq('topic', topicKey)
    .order('position')
    .order('id')
  if (error) {
    if (isMissingSchema(error)) return []
    throw new ApiError(error, isOffline() ? "You're offline and these notes aren't saved on this device yet." : undefined)
  }
  return data || []
}

// Keys of the topics that have at least one row in learn_notes.
export async function fetchNotedTopics() {
  const { data, error } = await supabase.from('learn_notes').select('topic')
  if (error) {
    if (isMissingSchema(error)) return []
    throw new ApiError(error)
  }
  return [...new Set((data || []).map((r) => r.topic))]
}

// ---------------------------------------------------------------------------
// Mistake Notebook
// ---------------------------------------------------------------------------
export async function fetchReviewQueue() {
  const { data, error } = await supabase
    .from('review_queue')
    .select('topic, question_id, box, due_at, added_at')
    .order('due_at', { ascending: true })
  if (error) throw new ApiError(error)
  const rows = data || []
  const byTopic = {}
  rows.forEach((r) => { (byTopic[r.topic] ||= []).push(r.question_id) })
  const questions = {}
  await Promise.all(Object.entries(byTopic).map(async ([topic, ids]) => {
    const qs = await fetchQuestionsByIds(topic, ids)
    qs.forEach((q) => { questions[`${topic}:${q.id}`] = q })
  }))
  return rows
    .map((r) => ({ ...r, question: questions[`${r.topic}:${r.question_id}`] }))
    .filter((r) => r.question)
}

export async function removeFromReview(topic, questionId) {
  const { error } = await supabase.from('review_queue').delete().match({ topic, question_id: questionId })
  if (error) throw new ApiError(error)
}

// ---------------------------------------------------------------------------
// Daily Challenge
// ---------------------------------------------------------------------------
export async function fetchDailyChallenge() {
  const { data, error } = await supabase.rpc('get_daily_challenge')
  if (error) throw new ApiError(error)
  return data
}

export async function submitDailyChallenge({ date, answers, times, timeMs }) {
  const { data, error } = await supabase.rpc('submit_daily_challenge', {
    p_date: date,
    p_answers: answers,
    p_times: times,
    p_time_ms: Math.round(timeMs),
  })
  if (error) throw new ApiError(error)
  return data
}

export async function fetchLeaderboard(date) {
  const { data, error } = await supabase.rpc('daily_leaderboard', { p_date: date || null })
  if (error) throw new ApiError(error)
  return data || []
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function fetchDreamJob(userId) {
  const { data, error } = await supabase.from('dream_jobs').select('dream_job').eq('user_id', userId).maybeSingle()
  if (error) throw new ApiError(error)
  return data?.dream_job || ''
}

export async function saveDreamJob(user, job) {
  const { error } = await supabase
    .from('dream_jobs')
    .upsert({ user_id: user.id, email: user.email, dream_job: job }, { onConflict: 'user_id' })
  if (error) throw new ApiError(error)
}

export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })
  if (error || data?.error) throw new Error(await readFunctionError(error, data, 'Could not delete your account.'))
}

// supabase-js only says "non-2xx status code"; the real message is in the body.
export async function readFunctionError(error, data, fallback) {
  if (data?.error) return data.error
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json()
      if (body?.error) return body.error
    } catch {
      // body wasn't JSON — use the generic message
    }
  }
  if (error?.name === 'FunctionsFetchError') return 'Network error — check your connection and try again.'
  return error?.message || fallback
}
