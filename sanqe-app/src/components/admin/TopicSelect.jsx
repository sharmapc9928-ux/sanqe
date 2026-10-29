import { ALL_SUBJECTS } from '../../lib/syllabus'

// Every topic that has questions (runs in the quiz screen), by subject. Mains
// subjects share names with Prelims ones, so their group label says so.
export const ADMIN_SUBJECTS = ALL_SUBJECTS.map((s) => ({
  ...s,
  label: s.stage === 'mains' ? `Mains · ${s.name}` : s.name,
  topics: s.groups.flatMap((g) => g.topics).filter((t) => t.practice === 'quiz'),
})).filter((s) => s.topics.length > 0)

export const ADMIN_TOPICS = ADMIN_SUBJECTS.flatMap((s) => s.topics)

export function TopicSelect({ label = 'Topic', value, onChange, disabled = false, hint }) {
  return (
    <label className="field admin-topic">
      <span>{label}{hint && <> <em>{hint}</em></>}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {ADMIN_SUBJECTS.map((s) => (
          <optgroup key={s.key} label={s.label}>
            {s.topics.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
