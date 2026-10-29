import { TOPIC_BY_KEY } from './syllabus'

// Practice modes + Speed Score.
export { TOPIC_BY_KEY }

export const OPT_KEYS = ['a', 'b', 'c', 'd', 'e']

// DI topics (di_*, m_di_*) are practised one set at a time: a chart or table
// with its questions. Their question totals aren't shown, only the position
// inside the set.
export const isDiTopic = (key) => /(^|_)di_/.test(key || '')

// Timed practice modes. Focus modes run one study block of a focus
// technique (see lib/focus.js); when it ends the break starts by itself.
export const MODES = [
  { key: 'm15', label: '15 min', minutes: 15, tag: 'Quick sprint', mode: 'practice' },
  { key: 'm30', label: '30 min', minutes: 30, tag: 'Solid session', mode: 'practice' },
  { key: 'm60', label: '1 hour', minutes: 60, tag: 'Full practice', mode: 'practice' },
  { key: 'intense', label: 'Intense', minutes: 15, tag: 'Per-question clock · unanswered = wrong', mode: 'intense' },
]

export const FOCUS_MODES = [
  { key: 'pomodoro', label: 'Pomodoro', minutes: 25, tag: '25 min focus, then a 5 min break', mode: 'practice', focus: 'pomodoro' },
  { key: 'fifty_two', label: '52 / 17', minutes: 52, tag: '52 min deep work, then a 17 min break', mode: 'practice', focus: 'fifty_two' },
]

export const MODE_BY_KEY = Object.fromEntries([...MODES, ...FOCUS_MODES].map((m) => [m.key, m]))

// Intense mode gives a little more than the exam-ready pace per question.
export function intenseSeconds(topic) {
  const raw = Math.round(((topic?.targetSec || 30) * 1.2) / 5) * 5
  return Math.max(10, Math.min(180, raw))
}

// Speed Score (0–1000): accuracy × pace over the last 50 attempts.
//   pace = min(1, target / your average time)
// so answering everything right at (or faster than) the target pace = 1000.
// Needs at least MIN_FOR_SCORE recent attempts to be meaningful.
export const MIN_FOR_SCORE = 10

export function speedScore(topicStats, topic) {
  if (!topicStats || !topic?.targetSec) return null
  const n = Number(topicStats.recent_attempted) || 0
  if (n < MIN_FOR_SCORE) return null
  const accuracy = (Number(topicStats.recent_correct) || 0) / n
  const avgSec = (Number(topicStats.recent_avg_ms) || 0) / 1000
  const pace = avgSec > 0 ? Math.min(1, topic.targetSec / avgSec) : 1
  return Math.round(1000 * accuracy * pace)
}

export function speedLevel(score) {
  if (score === null || score === undefined) return { label: 'Not rated', tone: 'muted' }
  if (score >= 800) return { label: 'Topper pace', tone: 'great' }
  if (score >= 600) return { label: 'Exam-ready', tone: 'good' }
  if (score >= 400) return { label: 'Developing', tone: 'mid' }
  return { label: 'Needs work', tone: 'low' }
}
