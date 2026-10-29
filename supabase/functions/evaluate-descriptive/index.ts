import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Descriptive-test evaluator (IBPS PO: Essay + Comprehension, SBI PO: Letter
// + Essay), built like an automated essay scorer.
//
// Neither IBPS nor SBI publishes its rubric. So this function copies how
// automated scorers work:
//   1. Measurable features are computed in CODE (word count, structure,
//      overlap with the passage) - never left to the model's guess.
//   2. The model only scores fixed rubric criteria against band anchors.
//   3. Totals, length penalties and copy penalties are applied in CODE, so
//      the same answer always gets the same treatment.
//
// Access: the caller must be signed in and must own the submission. A
// submission is scored once; later calls return the saved evaluation. Each
// user can trigger at most DAILY_LIMIT new evaluations per 24 hours, which
// caps what any one account can spend on the model. The limit is enforced
// by claim_eval_slot() (migration eval_claims) so parallel requests can't
// race past it, and one evaluation makes at most MAX_GEMINI_CALLS model calls.

const DAILY_LIMIT = 10

const EXAMS = {
  ibps_po: { total: 25, essayMax: 13, compMax: 12, letterMax: 0 },
  sbi_po: { total: 50, essayMax: 25, compMax: 0, letterMax: 25 },
} as const
type ExamKey = keyof typeof EXAMS

// Raw rubric points; scaled to each exam's (estimated) section maximum.
const ESSAY_CRITERIA = { content_relevance: 4, organization: 3, grammar_mechanics: 3, vocabulary_clarity: 2, coherence: 1 } as const
const ESSAY_RAW_MAX = 13
const LETTER_CRITERIA = { content_purpose: 4, format_conventions: 3, grammar_mechanics: 3, tone_vocabulary: 2, coherence: 1 } as const
const LETTER_RAW_MAX = 13
const COMP_CRITERIA = { completeness: 2, accuracy: 2, own_words: 1, conciseness: 1 } as const
const COMP_RAW_MAX = 6

// Strongest judges first. Lite models are left out on purpose: they score too
// leniently to be trusted for marking.
const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"]
const RETRYABLE = new Set([429, 500, 502, 503, 504])
// Most model calls one evaluation may make (models x retries), whatever goes wrong.
const MAX_GEMINI_CALLS = 6
// Postgres / PostgREST codes for "that function isn't on the database yet".
const MISSING_FUNCTION = new Set(["PGRST202", "42883"])
const LIMIT_MESSAGE = `You've used all ${DAILY_LIMIT} evaluations for today. Your answers are saved — evaluate this attempt from My Results tomorrow.`

const COMMON_RULES = `Behave like an automated scorer: strict, consistent, unimpressed by length, flowery words, quotations or memorised filler.

You do NOT compute totals or apply word-limit or copying penalties - the system does that from measured features. You only rate each criterion using the band anchors, as whole or half numbers.

CALIBRATION: a typical aspirant answer lands in the middle bands. Top band only for near-flawless work. Never round up out of kindness. Full marks on a criterion means you found NO flaw for that criterion. Before finalising, re-read each answer looking for: generic or unsupported claims, a missing dimension, repetition, weak transitions, any grammar or punctuation slip, and any imprecise word. Deduct half a mark on the relevant criterion for each flaw class you find.`

const ESSAY_RUBRIC = `ESSAY CRITERIA
content_relevance (0-4)
  4 = fully on the exact topic; 3+ well-developed points backed by concrete specifics (named schemes, figures/data, real examples), covers causes, impact, challenges AND way forward; no generic sentences
  3 = on topic, several relevant points with some specifics, but at least one dimension thin or some generic lines
  2 = on topic but generic/surface-level, few specifics, or drifts partly
  1 = mostly generic or only loosely tied to the topic
  0 = off-topic, placeholder/test text, or memorised text unrelated to the prompt
organization (0-3)
  3 = clear introduction, body paragraphs each with one idea, conclusion/way forward
  2 = structure present but one part weak or missing
  1 = little visible structure
  0 = no structure / fragments
grammar_mechanics (0-3) - count real errors (agreement, tense, articles, prepositions, fragments, run-ons, spelling, punctuation that changes meaning)
  3 = 0-1 minor errors; 2 = 2-4 errors, meaning always clear; 1 = 5-8 errors or some that obscure meaning; 0 = 9+ errors or frequently unclear
vocabulary_clarity (0-2)
  2 = precise, formal, appropriate vocabulary; concise sentences; 1 = adequate but repetitive, vague or needlessly ornate; 0 = poor/incorrect word choice throughout
coherence (0-1)
  1 = ideas connect logically with transitions; 0.5 = some jumps or repetition; 0 = disjointed
off_topic: true if the essay does not address the given topic at all.`

const LETTER_RUBRIC = `LETTER CRITERIA (formal or informal, as the task asks)
content_purpose (0-4)
  4 = every point the task asks for is covered with relevant specifics, purpose is clear from the opening; 3 = all points covered but one is thin; 2 = misses a required point or is generic; 1 = largely misses the purpose; 0 = off-task
format_conventions (0-3)
  3 = correct layout for the letter type: sender address/date, receiver address (formal), subject line (formal), salutation, body paragraphs, closing and signature; 2 = one element missing or wrong; 1 = several missing; 0 = no letter format
grammar_mechanics (0-3) - same error bands as the essay
tone_vocabulary (0-2)
  2 = tone exactly suits the recipient (polite and formal for officials), precise words; 1 = tone slips or wording is vague/repetitive; 0 = inappropriate tone
coherence (0-1)
  1 = logical paragraph flow; 0.5 = some jumps; 0 = disjointed
off_topic: true if the letter does not address the task at all.`

const COMP_RUBRIC = `COMPREHENSION - rate EACH sub-question separately:
completeness (0-2): 2 = every part answered; 1 = partly; 0 = not answered / irrelevant
accuracy (0-2): 2 = fully correct AND includes every key point the passage gives; 1 = correct but misses a key point, or vague; 0 = wrong or not supported by the passage
own_words (0-1): 1 = paraphrased; 0.5 = partly lifted; 0 = largely copied (the system also measures copying)
conciseness (0-1): 1 = to the point; 0.5 = some padding; 0 = rambling
If the answer is wrong (accuracy 0), completeness must also be 0.`

const IMPROVED_RULE = `IMPROVED VERSION: rewrite the candidate's own text as a model answer a top scorer would write - keep their main ideas, fix every error, tighten the structure, add one or two concrete specifics where they were generic, and stay within the word limit. Plain text with paragraph breaks. If the candidate wrote nothing, return "".`

const GRAMMAR_RULE = `GRAMMAR FLAGS: list the actual errors in the candidate's writing (max 10, most important first). "text" must be copied exactly from the candidate's writing.`

function systemPrompt(exam: ExamKey): string {
  if (exam === "sbi_po") {
    return `You are the scoring engine for the SBI PO Mains Descriptive Test (Letter + Essay, 50 marks, 30 minutes, English). ${COMMON_RULES}

${LETTER_RUBRIC}

${ESSAY_RUBRIC}

${GRAMMAR_RULE}

${IMPROVED_RULE}

Return ONLY valid JSON in exactly this shape:
{
  "letter": { "content_purpose": number, "format_conventions": number, "grammar_mechanics": number, "tone_vocabulary": number, "coherence": number, "off_topic": boolean, "feedback": string, "improved": string },
  "essay": { "content_relevance": number, "organization": number, "grammar_mechanics": number, "vocabulary_clarity": number, "coherence": number, "off_topic": boolean, "feedback": string, "improved": string },
  "grammar_flags": [{ "text": string, "issue": string, "suggestion": string }],
  "improvement_tips": [string, string, string]
}
Feedback must be specific to THIS answer (name what was missing or wrong), 2-4 sentences each, in simple English.`
  }
  return `You are the scoring engine for the IBPS PO Mains Descriptive Test (Essay + Reading Comprehension, 25 marks, 30 minutes, English). IBPS uses an automated scorer that rewards writing proficiency: relevance, organisation, grammatical accuracy, precise vocabulary and coherence. ${COMMON_RULES}

${ESSAY_RUBRIC}

${COMP_RUBRIC}

${GRAMMAR_RULE}

${IMPROVED_RULE} (Apply it to the essay only.)

Return ONLY valid JSON in exactly this shape:
{
  "essay": { "content_relevance": number, "organization": number, "grammar_mechanics": number, "vocabulary_clarity": number, "coherence": number, "off_topic": boolean, "feedback": string, "improved": string },
  "comprehension": [
    { "q": number, "completeness": number, "accuracy": number, "own_words": number, "conciseness": number, "feedback": string }
  ],
  "comprehension_feedback": string,
  "grammar_flags": [{ "text": string, "issue": string, "suggestion": string }],
  "improvement_tips": [string, string, string]
}
Feedback must be specific to THIS answer (name what was missing or wrong), 2-4 sentences each, in simple English.`
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------- measured features (deterministic) ----------

function words(text: string): string[] {
  return (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
}

function wordCount(text: string): number {
  const t = (text || "").trim()
  return t ? t.split(/\s+/).length : 0
}

function sentenceCount(text: string): number {
  return (text || "").split(/[.!?]+(\s|$)/).map((s) => s.trim()).filter((s) => s.length > 2).length
}

function paragraphCount(text: string): number {
  return (text || "").split(/\n\s*\n|\n/).map((p) => p.trim()).filter((p) => wordCount(p) >= 5).length
}

// Share of the answer's word n-grams that appear verbatim in the passage.
function copyRatio(answer: string, passage: string): number {
  const a = words(answer)
  const p = words(passage)
  const n = a.length >= 12 ? 5 : 3
  if (a.length < n) return 0
  const grams = new Set<string>()
  for (let i = 0; i + n <= p.length; i++) grams.add(p.slice(i, i + n).join(" "))
  let hit = 0
  let total = 0
  for (let i = 0; i + n <= a.length; i++) {
    total++
    if (grams.has(a.slice(i, i + n).join(" "))) hit++
  }
  return total ? hit / total : 0
}

// Word-limit multiplier, applied to a section's raw score.
function lengthFactor(wc: number, min: number, max: number): number {
  if (wc === 0) return 0
  if (wc >= min && wc <= max) return 1
  if (wc > max) {
    if (wc <= max * 1.2) return 0.95
    if (wc <= max * 1.5) return 0.85
    return 0.75
  }
  if (wc >= min * 0.8) return 0.9
  if (wc >= min * 0.6) return 0.75
  if (wc >= min * 0.4) return 0.5
  return 0.25
}

function copyFactor(ratio: number): number {
  if (ratio >= 0.6) return 0.5
  if (ratio >= 0.35) return 0.75
  return 1
}

function num(v: unknown, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, n))
}

const quarter = (n: number) => Math.round(n * 4) / 4

function textFeatures(text: string, min: number, max: number) {
  const wc = wordCount(text)
  const sentences = sentenceCount(text)
  return {
    word_count: wc,
    word_limit: [min, max],
    sentences,
    paragraphs: paragraphCount(text),
    avg_sentence_length: sentences ? Math.round((wc / sentences) * 10) / 10 : 0,
    length_factor: lengthFactor(wc, min, max),
  }
}

// Scores one written section (essay or letter) from the model's criteria.
function scoreWritten(
  modelPart: any,
  criteria: Record<string, number>,
  rawMax: number,
  sectionMax: number,
  features: ReturnType<typeof textFeatures>,
  relevanceKey: string,
) {
  const m = modelPart ?? {}
  const crit: Record<string, number> = {}
  let raw = 0
  for (const [k, max] of Object.entries(criteria)) {
    crit[k] = num(m[k], max)
    raw += crit[k]
  }
  const offTopic = !!m.off_topic || crit[relevanceKey] === 0
  if (features.word_count === 0) raw = 0
  else if (offTopic) raw = Math.min(raw, 2)
  const score = quarter(Math.min(sectionMax, (raw / rawMax) * sectionMax * features.length_factor))
  let feedback: string = typeof m.feedback === "string" ? m.feedback : ""
  if (features.word_count > 0 && features.length_factor < 1) {
    feedback += ` Word count ${features.word_count} is outside the ${features.word_limit[0]}-${features.word_limit[1]} range, so this score was reduced.`
  }
  const improved = features.word_count > 0 && typeof m.improved === "string" ? m.improved.trim() : ""
  return { score, raw, crit, offTopic, feedback: feedback.trim(), improved }
}

// ---------- Gemini ----------

async function callGemini(key: string, system: string, userMessage: string) {
  const override = Deno.env.get("GEMINI_MODEL")
  const models = override ? [override, ...DEFAULT_MODELS.filter((m) => m !== override)] : DEFAULT_MODELS
  const errors: string[] = []
  let calls = 0

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (calls >= MAX_GEMINI_CALLS) break
      calls++
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
            },
          }),
        },
      )
      if (res.ok) return { model, data: await res.json() }

      const text = (await res.text()).slice(0, 300)
      errors.push(`${model} (${res.status}): ${text}`)
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(`Gemini API error: ${errors.join(" | ")}`)
      }
      if (!RETRYABLE.has(res.status)) break
      if (attempt < 2) await sleep(2500 * (attempt + 1))
    }
  }
  throw new Error(`The evaluator is busy right now. Please retry in a minute.`)
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  // The slot this request claimed in claim_eval_slot(). It is handed back if the
  // model never answered (outage), so a Gemini problem doesn't use up the student's day.
  let releaseSlot: (() => PromiseLike<unknown>) | null = null
  let modelAnswered = false

  try {
    const body = await req.json().catch(() => ({}))
    const submissionId = Number(body?.submission_id)
    if (!Number.isInteger(submissionId) || submissionId <= 0) return json({ error: "submission_id is required" }, 400)

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    // ---- who is asking ----
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    const { data: userData } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    const user = userData?.user
    if (!user) return json({ error: "Please log in." }, 401)

    const { data: submission, error: subError } = await supabase
      .from("descriptive_submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle()
    // Same answer for "doesn't exist" and "not yours", so ids can't be probed.
    if (subError || !submission || submission.user_id !== user.id) return json({ error: "Submission not found" }, 404)

    // ---- already scored: return the saved evaluation, never re-bill the model ----
    const { data: existing } = await supabase
      .from("descriptive_evaluations")
      .select("*")
      .eq("submission_id", submissionId)
      .maybeSingle()
    if (existing) return json(existing)

    // ---- per-user daily cap on new evaluations ----
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: usedToday, error: countError } = await supabase
      .from("descriptive_evaluations")
      .select("id, descriptive_submissions!inner(user_id)", { count: "exact", head: true })
      .eq("descriptive_submissions.user_id", user.id)
      .gte("created_at", since)
    if (countError) return json({ error: "Could not check your usage. Please retry." }, 500)
    if ((usedToday ?? 0) >= DAILY_LIMIT) return json({ error: LIMIT_MESSAGE }, 429)

    // Claim a slot BEFORE spending money. Parallel requests are serialised per user
    // in the database, so firing many at once can't get past the daily limit.
    // (If the function isn't on the database yet, the saved-evaluations count above
    // is the only limit - same as before.)
    const { data: claim, error: claimError } = await supabase.rpc("claim_eval_slot", {
      p_user: user.id,
      p_submission: submissionId,
      p_limit: DAILY_LIMIT,
    })
    if (claimError && !MISSING_FUNCTION.has(claimError.code ?? "")) {
      console.error("claim_eval_slot", claimError)
      return json({ error: "Could not check your usage. Please retry." }, 500)
    }
    if (!claimError) {
      if (claim === "busy") return json({ error: "This answer is already being evaluated. Give it a few seconds, then open My Results." }, 409)
      if (claim === "limit") return json({ error: LIMIT_MESSAGE }, 429)
      releaseSlot = () => supabase.rpc("release_eval_slot", { p_submission: submissionId })
    }

    const exam: ExamKey = submission.exam === "sbi_po" ? "sbi_po" : "ibps_po"
    const cfg = EXAMS[exam]

    // The database caps these too (descriptive_*_len); this keeps older rows in bounds.
    const essay: string = String(submission.essay_answer || "").slice(0, 8000)
    const letter: string = String(submission.letter_answer || "").slice(0, 6000)
    const answers: string[] = Array.isArray(submission.comprehension_answers)
      ? submission.comprehension_answers.map((a: unknown) => String(a ?? "").slice(0, 4000))
      : []
    const hasAny = essay.trim() || letter.trim() || answers.some((a) => (a || "").trim())
    if (!hasAny) return json({ error: "There's nothing to evaluate — all answers were empty." }, 400)

    const { data: prompt, error: promptError } = await supabase
      .from("descriptive_prompts")
      .select("*")
      .eq("exam", exam)
      .eq("mock_number", submission.mock_number)
      .maybeSingle()
    if (promptError || !prompt) return json({ error: "Prompt not found for this mock" }, 404)

    const eMin: number = prompt.word_limit_min ?? 250
    const eMax: number = prompt.word_limit_max ?? 300
    const lMin: number = prompt.letter_word_min ?? 150
    const lMax: number = prompt.letter_word_max ?? 200
    const essayFeatures = textFeatures(essay, eMin, eMax)
    const letterFeatures = textFeatures(letter, lMin, lMax)

    const questions: string[] = exam === "ibps_po" && Array.isArray(prompt.sub_questions) ? prompt.sub_questions : []
    const passage: string = prompt.passage || ""
    const answerFeatures = questions.map((_, i) => {
      const a = answers[i] || ""
      const ratio = copyRatio(a, passage)
      return { word_count: wordCount(a), copied_from_passage_pct: Math.round(ratio * 100), copy_factor: copyFactor(ratio) }
    })

    const parts: string[] = []
    if (exam === "sbi_po") {
      parts.push(
        `LETTER TASK: ${prompt.letter_topic}`,
        prompt.letter_instructions ? `LETTER INSTRUCTIONS: ${prompt.letter_instructions}` : "",
        `MEASURED: ${letterFeatures.word_count} words (target ${lMin}-${lMax}), ${letterFeatures.paragraphs} paragraph(s).`,
        `CANDIDATE'S LETTER:\n${letter.trim() || "(no answer given)"}`,
        `---`,
      )
    }
    parts.push(
      `ESSAY TOPIC: ${prompt.essay_topic}`,
      prompt.essay_instructions ? `ESSAY INSTRUCTIONS: ${prompt.essay_instructions}` : "",
      `MEASURED: ${essayFeatures.word_count} words (limit ${eMin}-${eMax}), ${essayFeatures.paragraphs} paragraph(s), ${essayFeatures.sentences} sentence(s).`,
      `CANDIDATE'S ESSAY:\n${essay.trim() || "(no answer given)"}`,
    )
    if (exam === "ibps_po") {
      parts.push(
        `---`,
        `PASSAGE:\n${passage}`,
        `SUB-QUESTIONS AND CANDIDATE ANSWERS:`,
        ...questions.map(
          (q, i) =>
            `Q${i + 1}. ${q}\nMEASURED: ${answerFeatures[i].word_count} words, ${answerFeatures[i].copied_from_passage_pct}% verbatim overlap with passage\nAnswer: ${(answers[i] || "").trim() || "(no answer given)"}`,
        ),
      )
    }
    const userMessage = parts.filter(Boolean).join("\n\n")

    const geminiKey = Deno.env.get("GEMINI_API_KEY")
    if (!geminiKey) return json({ error: "The evaluator is not configured on the server." }, 500)

    let ai: { model: string; data: any }
    try {
      ai = await callGemini(geminiKey, systemPrompt(exam), userMessage)
      modelAnswered = true
    } catch (e) {
      // Details stay in the server log; students get a plain message.
      console.error("evaluate-descriptive gemini", e instanceof Error ? e.message : String(e))
      return json({ error: "The evaluator is busy right now. Please retry in a minute." }, 503)
    }

    const modelParts = ai.data.candidates?.[0]?.content?.parts ?? []
    const rawText: string = modelParts.filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("")

    let ev: any
    try {
      ev = JSON.parse(rawText.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim())
    } catch {
      return json({ error: "The evaluator returned an unreadable response. Please retry." }, 502)
    }

    // ----- Essay (both exams) -----
    const essayResult = scoreWritten(ev.essay, ESSAY_CRITERIA, ESSAY_RAW_MAX, cfg.essayMax, essayFeatures, "content_relevance")

    // ----- Letter (SBI) -----
    const letterResult = exam === "sbi_po"
      ? scoreWritten(ev.letter, LETTER_CRITERIA, LETTER_RAW_MAX, cfg.letterMax, letterFeatures, "content_purpose")
      : null

    // ----- Comprehension (IBPS) -----
    let compScore: number | null = null
    let compFeedback = ""
    let compBreakdown: any[] = []
    if (exam === "ibps_po") {
      const perQMax = questions.length ? cfg.compMax / questions.length : 0
      const modelComp: any[] = Array.isArray(ev.comprehension) ? ev.comprehension : []
      compBreakdown = questions.map((_, i) => {
        const m = modelComp.find((c) => Number(c?.q) === i + 1) ?? modelComp[i] ?? {}
        const crit: Record<string, number> = {}
        let raw = 0
        for (const [k, max] of Object.entries(COMP_CRITERIA)) {
          crit[k] = num(m[k], max)
          raw += crit[k]
        }
        const f = answerFeatures[i]
        if (f.word_count === 0 || crit.accuracy === 0) raw = 0
        const score = quarter((raw / COMP_RAW_MAX) * perQMax * f.copy_factor)
        return { q: i + 1, max: Math.round(perQMax * 100) / 100, score, ...crit, ...f, feedback: m.feedback ?? "" }
      })
      compScore = quarter(Math.min(cfg.compMax, compBreakdown.reduce((s, c) => s + c.score, 0)))
      compFeedback = typeof ev.comprehension_feedback === "string" ? ev.comprehension_feedback : ""
      const perQText = compBreakdown
        .map((c) => `Q${c.q} (${c.score}/${c.max}): ${c.feedback}${c.copy_factor < 1 ? ` [${c.copied_from_passage_pct}% copied from passage - marks reduced]` : ""}`)
        .join("\n")
      if (perQText) compFeedback = compFeedback ? `${compFeedback}\n\n${perQText}` : perQText
    }

    const total = quarter(essayResult.score + (letterResult?.score ?? 0) + (compScore ?? 0))
    const copiedWarning = answerFeatures.some((f) => f.copy_factor < 1)

    const breakdown = {
      model: ai.model,
      exam,
      essay: { max: cfg.essayMax, raw: essayResult.raw, raw_max: ESSAY_RAW_MAX, criteria: essayResult.crit, criteria_max: ESSAY_CRITERIA, off_topic: essayResult.offTopic, ...essayFeatures },
      ...(letterResult ? { letter: { max: cfg.letterMax, raw: letterResult.raw, raw_max: LETTER_RAW_MAX, criteria: letterResult.crit, criteria_max: LETTER_CRITERIA, off_topic: letterResult.offTopic, ...letterFeatures } } : {}),
      ...(exam === "ibps_po" ? { comprehension: { max: cfg.compMax, questions: compBreakdown } } : {}),
    }

    const { data: saved, error: saveError } = await supabase
      .from("descriptive_evaluations")
      .insert({
        submission_id: submission.id,
        essay_score: essayResult.score,
        essay_feedback: essayResult.feedback,
        improved_essay: essayResult.improved || null,
        letter_score: letterResult ? letterResult.score : null,
        letter_feedback: letterResult ? letterResult.feedback : null,
        improved_letter: letterResult?.improved || null,
        comprehension_score: compScore,
        comprehension_feedback: exam === "ibps_po" ? compFeedback.trim() : null,
        total_score: total,
        grammar_flags: Array.isArray(ev.grammar_flags) ? ev.grammar_flags.slice(0, 10) : [],
        copied_content_warning: copiedWarning,
        improvement_tips: Array.isArray(ev.improvement_tips) ? ev.improvement_tips.slice(0, 3) : [],
        score_breakdown: breakdown,
      })
      .select()
      .single()

    if (saveError) {
      // Two tabs raced and the other one saved first: return that one.
      if (saveError.code === "23505") {
        const { data: again } = await supabase.from("descriptive_evaluations").select("*").eq("submission_id", submissionId).maybeSingle()
        if (again) return json(again)
      }
      console.error("evaluate-descriptive save", saveError)
      return json({ error: "We scored your answer but couldn't save it. Please retry." }, 500)
    }
    return json(saved)
  } catch (err) {
    console.error(err)
    return json({ error: "Something went wrong while evaluating. Please retry." }, 500)
  } finally {
    // Only give the slot back if the model never answered; an answered request
    // has cost money, whether or not it could be saved.
    if (releaseSlot && !modelAnswered) {
      try { await releaseSlot() } catch (e) { console.error("release_eval_slot", e) }
    }
  }
})
