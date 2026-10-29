import { supabase } from '../supabaseClient'
import { ApiError, isMissingSchema, readFunctionError } from './api'
import { countWords } from './format'

// Per-exam structure. Marks splits are our own estimates — IBPS and SBI
// publish only the section total — and are labelled as such in the report.
export const EXAMS = {
  ibps_po: {
    key: 'ibps_po',
    name: 'IBPS PO',
    title: 'IBPS PO MAINS — DESCRIPTIVE TEST',
    format: 'Essay + Comprehension',
    total: 25,
    durationSec: 30 * 60,
    parts: [
      { key: 'essay', label: 'Essay', max: 13 },
      { key: 'comprehension', label: 'Comprehension', max: 12 },
    ],
    safeZone: 15,
  },
  sbi_po: {
    key: 'sbi_po',
    name: 'SBI PO',
    title: 'SBI PO MAINS — DESCRIPTIVE TEST',
    format: 'Letter + Essay',
    total: 50,
    durationSec: 30 * 60,
    parts: [
      { key: 'letter', label: 'Letter', max: 25 },
      { key: 'essay', label: 'Essay', max: 25 },
    ],
    safeZone: 25,
  },
}

export const EXAM_LIST = [EXAMS.ibps_po, EXAMS.sbi_po]

const examOf = (row) => row?.exam || 'ibps_po'

export async function listPrompts() {
  const { data, error } = await supabase
    .from('descriptive_prompts')
    .select('*')
    .order('mock_number', { ascending: true })
  if (error) throw new ApiError(error)
  return (data || []).map((p) => ({ ...p, exam: examOf(p) }))
}

export async function getPrompt(exam, mockNumber) {
  const { data, error } = await supabase
    .from('descriptive_prompts')
    .select('*')
    .eq('mock_number', mockNumber)
  if (error) throw new ApiError(error)
  const row = (data || []).find((p) => examOf(p) === exam)
  if (!row) throw new Error('This mock test is not available.')
  return { ...row, exam: examOf(row) }
}

// ---------- drafts (server copy; a local copy is kept by the test screen) ----------
export async function loadServerDraft(exam, mockNumber) {
  const { data, error } = await supabase
    .from('descriptive_drafts')
    .select('*')
    .eq('exam', exam)
    .eq('mock_number', mockNumber)
    .maybeSingle()
  if (error) {
    if (!isMissingSchema(error)) console.debug('Draft not loaded:', error.message)
    return null
  }
  return data
}

export function saveServerDraft(userId, exam, mockNumber, answers, candidateName) {
  return supabase
    .from('descriptive_drafts')
    .upsert({
      user_id: userId,
      exam,
      mock_number: mockNumber,
      candidate_name: candidateName,
      essay_answer: answers.essay,
      letter_answer: answers.letter,
      comprehension_answers: answers.comprehension,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,exam,mock_number' })
    .then(({ error }) => {
      if (error && !isMissingSchema(error)) console.debug('Draft autosave failed:', error.message)
    })
}

export function deleteServerDraft(exam, mockNumber) {
  return supabase
    .from('descriptive_drafts')
    .delete()
    .eq('exam', exam)
    .eq('mock_number', mockNumber)
    .then(() => {})
}

// ---------- submit + evaluate ----------
export async function submitAttempt({ exam, mockNumber, candidateName, answers, timeTakenSec }) {
  const row = {
    session_id: crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}`,
    candidate_name: candidateName || 'Candidate',
    mock_number: mockNumber,
    essay_answer: answers.essay,
    comprehension_answers: answers.comprehension,
    word_counts: {
      essay: countWords(answers.essay),
      letter: countWords(answers.letter),
      comprehension: answers.comprehension.map((a) => countWords(a)),
    },
    time_taken_sec: Math.max(0, Math.round(timeTakenSec)),
  }
  // Only send the newer columns when they're needed, so IBPS attempts keep
  // working on a database that hasn't had the multi-exam migration yet.
  if (exam !== 'ibps_po') {
    row.exam = exam
    row.letter_answer = answers.letter
  }
  const { data, error } = await supabase.from('descriptive_submissions').insert(row).select().single()
  if (error || !data) throw new ApiError(error, 'Could not save your answers.')
  return data
}

export async function evaluateAttempt(submissionId) {
  const { data, error } = await supabase.functions.invoke('evaluate-descriptive', {
    body: { submission_id: submissionId },
  })
  if (error || data?.error) throw new Error(await readFunctionError(error, data, 'Evaluation failed.'))
  return data
}

export async function listMyAttempts(userId) {
  const { data, error } = await supabase
    .from('descriptive_submissions')
    .select('*, descriptive_evaluations(*)')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
  if (error) throw new ApiError(error)
  return (data || []).map((row) => ({
    ...row,
    exam: examOf(row),
    evaluation: Array.isArray(row.descriptive_evaluations) ? row.descriptive_evaluations[0] || null : row.descriptive_evaluations || null,
  }))
}
