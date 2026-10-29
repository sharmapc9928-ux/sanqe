import { supabase } from '../supabaseClient'
import { ApiError } from './api'
import { TOPIC_BY_KEY } from './syllabus'

// Admin-only writes. The database enforces who may write (RLS checks
// public.is_admin()); the app only uses these to decide what to show.

const SHARED_TABLE = 'practice_questions'
const BUCKET = 'question-images'
const MAX_SIDE = 1600 // px — plenty for a DI chart on any phone
const KEEP_AS_IS_BYTES = 500 * 1024
const INSERT_CHUNK = 100

// The five original quant topics have their own tables; every other topic
// lives in practice_questions, filtered by topic key.
export const tableFor = (topicKey) => TOPIC_BY_KEY[topicKey]?.table || SHARED_TABLE
const scoped = (query, topicKey) => (TOPIC_BY_KEY[topicKey]?.table ? query : query.eq('topic', topicKey))

export async function fetchIsAdmin() {
  const { data, error } = await supabase.rpc('is_admin')
  return !error && data === true
}

export async function fetchTopicQuestions(topicKey) {
  const { data, error } = await scoped(supabase.from(tableFor(topicKey)).select('*'), topicKey)
    .order('id', { ascending: false })
    .limit(1000)
  if (error) throw new ApiError(error)
  return data || []
}

export async function fetchQuestionsByIdsAdmin(topicKey, ids) {
  if (!TOPIC_BY_KEY[topicKey] || ids.length === 0) return []
  const { data, error } = await scoped(supabase.from(tableFor(topicKey)).select('*'), topicKey).in('id', ids)
  if (error) throw new ApiError(error)
  return data || []
}

// Database errors in words that say what to fix.
function friendlyError(error) {
  if (error?.code === '42501') return 'Your account is not an admin, so the database refused this.'
  if (error?.code === '23514') return 'Some required field is empty or the correct option has no text.'
  if (error?.code === '23502') return 'A required field is empty (the original quant topics need all five options).'
  if (error?.code === '23503') return 'That topic is not on the database yet.'
  return error?.message || 'Could not save. Please try again.'
}

export async function saveQuestion(topicKey, row, id = null) {
  const table = supabase.from(tableFor(topicKey))
  const query = id ? table.update(row).eq('id', id) : table.insert(row)
  const { data, error } = await query.select().single()
  if (error) throw new Error(friendlyError(error))
  return data
}

export async function deleteQuestion(topicKey, id) {
  const { error } = await supabase.from(tableFor(topicKey)).delete().eq('id', id)
  if (error) throw new Error(friendlyError(error))
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------
// For duplicate checks: what's already in each of these topics.
export async function fetchExistingForTopics(topicKeys) {
  const out = {}
  await Promise.all(topicKeys.map(async (key) => {
    const cols = TOPIC_BY_KEY[key]?.table ? 'question, option_a' : 'passage, question, option_a'
    const { data, error } = await scoped(supabase.from(tableFor(key)).select(cols), key).limit(5000)
    if (error) throw new ApiError(error)
    out[key] = data || []
  }))
  return out
}

// items: [{ table, data }] → inserts table by table in chunks. Calls
// onProgress(done) as it goes; returns the number inserted. Stops at the
// first failed chunk (earlier chunks stay saved; re-importing the same file
// skips them as duplicates).
export async function insertQuestions(items, onProgress) {
  const byTable = new Map()
  items.forEach((it) => { if (!byTable.has(it.table)) byTable.set(it.table, []); byTable.get(it.table).push(it.data) })
  let done = 0
  for (const [table, rows] of byTable) {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK)
      const { error } = await supabase.from(table).insert(chunk)
      if (error) {
        const err = new Error(`${friendlyError(error)} (${done} of ${items.length} were saved before this.)`)
        err.saved = done
        throw err
      }
      done += chunk.length
      onProgress?.(done)
    }
  }
  return done
}

// ---------------------------------------------------------------------------
// Question reports
// ---------------------------------------------------------------------------
export async function fetchOpenReportCount() {
  const { count, error } = await supabase.from('question_reports').select('id', { count: 'exact', head: true }).eq('status', 'open')
  return error ? 0 : count || 0
}

// Reports grouped by question, newest first, with the question attached
// (null when the question has since been deleted).
export async function fetchReports(status) {
  const { data, error } = await supabase
    .from('question_reports')
    .select('id, topic, question_id, reason, note, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new ApiError(error)
  const groups = new Map()
  for (const r of data || []) {
    const key = `${r.topic}:${r.question_id}`
    if (!groups.has(key)) groups.set(key, { key, topic: r.topic, questionId: r.question_id, latest: r.created_at, reports: [] })
    groups.get(key).reports.push(r)
  }
  const byTopic = {}
  groups.forEach((g) => { (byTopic[g.topic] ||= []).push(g.questionId) })
  const questions = {}
  await Promise.all(Object.entries(byTopic).map(async ([topic, ids]) => {
    const qs = await fetchQuestionsByIdsAdmin(topic, ids)
    qs.forEach((q) => { questions[`${topic}:${q.id}`] = q })
  }))
  return [...groups.values()].map((g) => ({ ...g, question: questions[g.key] || null }))
}

export async function setReportsStatus(ids, status) {
  const { error } = await supabase.from('question_reports').update({ status }).in('id', ids)
  if (error) throw new ApiError(error)
}

export async function deleteReports(ids) {
  const { error } = await supabase.from('question_reports').delete().in('id', ids)
  if (error) throw new ApiError(error)
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------
// Phone photos of a book page are 3–8 MB; shrink anything big to at most
// MAX_SIDE px and re-encode as WebP before it's uploaded.
async function shrinkImage(file) {
  if (file.type === 'image/gif') return file
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) {
    bitmap.close?.()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff' // transparent areas become white, as they're shown
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
  if (!blob || blob.type !== 'image/webp') {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.9))
  }
  return blob
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

// Shrinks and uploads a picture to `bucket` under `folder/` and returns its
// public URL.
export async function uploadImage(file, bucket, folder) {
  if (!file || !EXT[file.type]) throw new Error('Use a PNG, JPG, WebP or GIF picture.')
  const blob = await shrinkImage(file)
  if (blob.size > 2 * 1024 * 1024) throw new Error('Picture is still over 2 MB after shrinking. Crop it and try again.')
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `${folder}/${Date.now()}-${rand}.${EXT[blob.type] || 'jpg'}`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
  if (error) throw new Error(error.message || 'Upload failed.')
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// Uploads a picture for a question and returns its public URL.
export const uploadQuestionImage = (file, topicKey) => uploadImage(file, BUCKET, topicKey)
