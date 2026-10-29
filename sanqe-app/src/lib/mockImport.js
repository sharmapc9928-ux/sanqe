// Checks spreadsheet rows before a coaching imports questions into a mock.
// Same idea as importRows.js (every problem reported with its row number
// before anything is written), but rows go to a section of one mock instead
// of a practice topic.

import { duplicateKey, normalizeAnswer } from './importRows'

export const MOCK_TEMPLATE_HEADERS = [
  'section', 'passage', 'image_url', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e',
  'correct_option', 'explanation', 'explanation_hi',
]
const REQUIRED_HEADERS = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option']

const clean = (v) => String(v ?? '').trim()
const sectionKey = (name) => clean(name).toLowerCase().replace(/\s+/g, ' ')

/**
 * @param rows            parsed cells, first row = headers
 * @param sections        the mock's sections: [{ id, name }]
 * @param defaultSection  section id for rows whose section cell is empty
 * @param canAddSections  true while the mock is a draft: unknown section
 *                        names become new sections instead of errors
 * @param existing        questions already in the mock (duplicate check)
 * @returns { error, ignoredHeaders, newSections: [name], items: [{ row, section, data, errors, duplicate }] }
 *          item.section is a section id, or { name } for a section to create
 */
export function checkMockImport(rows, { sections, defaultSection, canAddSections, existing = [] }) {
  const nonEmpty = rows.filter((r) => r.some((c) => clean(c) !== ''))
  if (nonEmpty.length < 2) return { error: 'Add a header row and at least one question row.', ignoredHeaders: [], newSections: [], items: [] }

  const headers = rows[0].map((h) => clean(h).toLowerCase().replace(/\s+/g, '_'))
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
  if (missing.length) {
    return { error: `The header row is missing: ${missing.join(', ')}. Use the template's column names.`, ignoredHeaders: [], newSections: [], items: [] }
  }
  const ignoredHeaders = headers.filter((h) => h && !MOCK_TEMPLATE_HEADERS.includes(h) && h !== 'id')

  const byName = new Map(sections.map((s) => [sectionKey(s.name), s.id]))
  const newSections = []
  const seen = new Set(existing.map(duplicateKey))

  const items = []
  rows.slice(1).forEach((cells, i) => {
    if (!cells.some((c) => clean(c) !== '')) return
    const row = i + 2
    const get = (h) => { const idx = headers.indexOf(h); return idx === -1 ? '' : clean(cells[idx]) }
    const errors = []

    const sectionCell = get('section')
    let section = null
    if (!sectionCell) {
      section = defaultSection ?? null
      if (section === null) errors.push('no section (add a section column or pick a default section)')
    } else if (byName.has(sectionKey(sectionCell))) {
      section = byName.get(sectionKey(sectionCell))
    } else if (canAddSections) {
      if (!newSections.some((n) => sectionKey(n) === sectionKey(sectionCell))) newSections.push(sectionCell.slice(0, 60))
      section = { name: newSections.find((n) => sectionKey(n) === sectionKey(sectionCell)) }
    } else {
      errors.push(`unknown section "${sectionCell}" (sections can't be added after publishing)`)
    }

    const data = {
      passage: get('passage') || null,
      image_url: get('image_url') || null,
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
    if (data.image_url && !/^https:\/\/\S+$/i.test(data.image_url)) errors.push('image_url must be an https:// link')

    let duplicate = false
    if (!errors.length) {
      const key = duplicateKey(data)
      duplicate = seen.has(key)
      seen.add(key)
    }
    items.push({ row, section, data, errors, duplicate })
  })

  return { error: null, ignoredHeaders, newSections, items }
}
