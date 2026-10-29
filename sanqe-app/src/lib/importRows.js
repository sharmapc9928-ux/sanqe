// Checks spreadsheet rows before a bulk import, so every problem is reported
// with its row number before anything is written. Pure functions: the caller
// passes the topic list and the questions already on the database.

export const TEMPLATE_HEADERS = [
  'topic', 'passage', 'image_url', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e',
  'correct_option', 'explanation', 'explanation_hi', 'source',
]
const REQUIRED_HEADERS = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option']
const IGNORED_HEADERS = new Set(['id', 'created_at'])
// The five original quant tables have no passage / picture / source columns
// and always have five options.
const SHARED_ONLY = ['passage', 'image_url', 'source']

// "B", "(b)", "option b", "2" → "b"
export function normalizeAnswer(raw) {
  const s = String(raw ?? '').trim().toLowerCase().replace(/^option\s*/, '').replace(/[().\s]/g, '')
  if (/^[a-e]$/.test(s)) return s
  if (/^[1-5]$/.test(s)) return 'abcde'[Number(s) - 1]
  return null
}

const clean = (v) => String(v ?? '').trim()

// Same passage + question + option A = same question (a DI set repeats the
// question wording across different charts, so the text alone isn't enough).
export const duplicateKey = (q) => [q.passage, q.question, q.option_a].map((v) => clean(v).toLowerCase().replace(/\s+/g, ' ')).join('|')

/**
 * @param rows        parsed cells, first row = headers
 * @param topics      quiz topics: [{ key, name, table? }]
 * @param defaultTopic topic key for rows whose topic cell is empty
 * @returns { error, ignoredHeaders, items: [{ row, topic, table, data, errors }] }
 */
export function checkImport(rows, { topics, defaultTopic }) {
  const nonEmpty = rows.filter((r) => r.some((c) => clean(c) !== ''))
  if (nonEmpty.length < 2) return { error: 'Add a header row and at least one question row.', ignoredHeaders: [], items: [] }

  const headers = rows[0].map((h) => clean(h).toLowerCase().replace(/\s+/g, '_'))
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
  if (missing.length) {
    return { error: `The header row is missing: ${missing.join(', ')}. Use the template's column names.`, ignoredHeaders: [], items: [] }
  }
  const ignoredHeaders = headers.filter((h) => h && !TEMPLATE_HEADERS.includes(h) && !IGNORED_HEADERS.has(h))

  const byKey = new Map(topics.map((t) => [t.key, t]))
  const byName = new Map(topics.map((t) => [t.name.toLowerCase(), t]))

  const items = []
  rows.slice(1).forEach((cells, i) => {
    if (!cells.some((c) => clean(c) !== '')) return
    const row = i + 2 // spreadsheet row number (row 1 = headers)
    const get = (h) => { const idx = headers.indexOf(h); return idx === -1 ? '' : clean(cells[idx]) }
    const errors = []

    const topicCell = get('topic')
    const topic = topicCell
      ? byKey.get(topicCell.toLowerCase()) || byName.get(topicCell.toLowerCase())
      : byKey.get(defaultTopic)
    if (!topic) errors.push(topicCell ? `unknown topic "${topicCell}"` : 'no topic')

    const data = {
      question: get('question'),
      option_a: get('option_a'),
      option_b: get('option_b'),
      option_c: get('option_c'),
      option_d: get('option_d'),
      option_e: get('option_e') || null,
      correct_option: normalizeAnswer(get('correct_option')),
      explanation: get('explanation') || null,
      explanation_hi: get('explanation_hi') || null,
    }

    if (!data.question) errors.push('question is empty')
    const emptyOpts = ['a', 'b', 'c', 'd'].filter((k) => !data[`option_${k}`])
    if (emptyOpts.length) errors.push(`option ${emptyOpts.map((k) => k.toUpperCase()).join(', ')} empty`)
    if (!data.correct_option) {
      errors.push(get('correct_option') ? `correct_option "${get('correct_option')}" should be A–E` : 'correct_option is empty')
    } else if (!data[`option_${data.correct_option}`]) {
      errors.push(`correct option ${data.correct_option.toUpperCase()} has no text`)
    }

    if (topic?.table) {
      if (!data.option_e) errors.push(`${topic.name} needs all five options (option_e empty)`)
      const extra = SHARED_ONLY.filter((h) => get(h))
      if (extra.length) errors.push(`${topic.name} can't have ${extra.join(' / ')}`)
    } else {
      data.passage = get('passage') || null
      data.image_url = get('image_url') || null
      data.source = get('source') || null
      if (data.image_url && !/^https:\/\/\S+$/i.test(data.image_url)) errors.push('image_url must be an https:// link')
      if (topic) data.topic = topic.key
    }

    items.push({ row, topic: topic?.key || null, table: topic?.table || 'practice_questions', data, errors })
  })

  return { error: null, ignoredHeaders, items }
}

// Marks rows that are already on the database or repeat an earlier row.
// existing: { topicKey: [{ passage?, question, option_a }] }
export function markDuplicates(items, existing) {
  const seen = new Map()
  Object.entries(existing).forEach(([topic, qs]) => {
    seen.set(topic, new Set(qs.map(duplicateKey)))
  })
  return items.map((it) => {
    if (it.errors.length || !it.topic) return it
    const set = seen.get(it.topic) || new Set()
    seen.set(it.topic, set)
    const key = duplicateKey(it.data)
    if (set.has(key)) return { ...it, duplicate: true }
    set.add(key)
    return it
  })
}
