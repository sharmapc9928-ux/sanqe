import { intenseSeconds } from '../lib/topics'

// A "run" is one practice sitting held in memory (App context). Quiz writes
// answers into run.log; Results reads the finished run.

// endAt: pass the focus block's end time for Pomodoro / 52-17 runs so the
// quiz and the focus timer finish together.
export function newTopicRun(topic, mode, questions, { endAt = null } = {}) {
  const now = Date.now()
  const end = endAt || now + mode.minutes * 60 * 1000
  const withTopic = (q) => ({ ...q, topic: topic.key })
  return {
    id: now,
    kind: 'topic',
    topicKey: topic.key,
    subject: topic.subject,
    mode: mode.mode, // 'practice' | 'intense'
    modeKey: mode.key,
    modeLabel: mode.label,
    focus: mode.focus || null,
    questionSeconds: mode.mode === 'intense' ? intenseSeconds(topic) : null,
    durationSec: Math.max(1, Math.round((end - now) / 1000)),
    questions: questions.map(withTopic),
    startedAt: now,
    endAt: end,
    log: [],
    finished: false,
    endedReason: null,
  }
}

// Review = untimed pass over the given Mistake Notebook questions.
export function newReviewRun(questions) {
  const now = Date.now()
  return {
    id: now,
    kind: 'review',
    topicKey: null,
    mode: 'review',
    modeKey: 'review',
    modeLabel: 'Mistake review',
    questionSeconds: null,
    durationSec: null,
    questions,
    startedAt: now,
    endAt: null,
    log: [],
    finished: false,
    endedReason: null,
  }
}

export function summarize(log) {
  const attempted = log.length
  const correct = log.filter((l) => l.correct).length
  const timedOut = log.filter((l) => l.selected === null).length
  const wrong = attempted - correct
  const avgMs = attempted ? Math.round(log.reduce((s, l) => s + l.timeMs, 0) / attempted) : null
  return { attempted, correct, wrong, timedOut, avgMs }
}
