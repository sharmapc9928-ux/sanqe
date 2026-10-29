import { ChevronRight, Lock } from 'lucide-react'
import { levelFor } from '../lib/practice'
import { linkProps } from '../lib/router'
import { isFreeTopic } from '../lib/syllabus'
import { speedLevel, speedScore } from '../lib/topics'
import { percent } from '../lib/format'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Subject card: icon tile, name, one-line description, topic count. How many
// questions there are is deliberately not shown.
export function SubjectCard({ subject, to, counts, stats }) {
  const topics = subject.groups.flatMap((g) => g.topics)
  const quizTopics = topics.filter((t) => t.practice === 'quiz')
  const solved = stats?.topics ? quizTopics.reduce((s, t) => s + (Number(stats.topics[t.key]?.attempted) || 0), 0) : 0
  return (
    <a className={`card subject-card hue-${subject.hue}`} {...linkProps(to)}>
      <span className="subject-tile"><subject.Icon size={22} /></span>
      <span className="subject-body">
        <span className="subject-name">{subject.name}</span>
        <span className="subject-desc">{subject.desc}</span>
        <span className="subject-meta">
          <span>{plural(topics.length, 'topic')}</span>
          {solved > 0 && <span>{solved} solved</span>}
        </span>
      </span>
      <ChevronRight size={18} className="chev" aria-hidden="true" />
    </a>
  )
}

// One topic in a subject's list. `mode` = 'practice' | 'learn'. `locked`: the
// student needs a plan for it (the text says which); `free`: it is one of the
// free topics (set for a student without a plan).
export function TopicRow({ topic, to, count, stats, hasNotes, mode, locked, free }) {
  const s = stats?.topics?.[topic.key]
  const attempted = Number(s?.attempted) || 0
  const score = speedScore(s, topic)
  const level = speedLevel(score)
  let meta = null
  if (mode === 'practice') {
    if (topic.practice === 'link') meta = <span className="topic-count">Open</span>
    else if (count === 0) meta = <span className="topic-count empty">Coming soon</span>
  } else {
    meta = hasNotes ? <span className="topic-count">Notes</span> : <span className="topic-count empty">Coming soon</span>
  }
  return (
    <li>
      <a className="topic-row" {...linkProps(to)}>
        <span className={`topic-icon hue-${topic.hue}`}><topic.Icon size={18} /></span>
        <span className="topic-main">
          <span className="topic-title">{topic.name}</span>
          <span className="topic-sub">
            {mode === 'practice' && attempted > 0
              ? <>{attempted} solved · {percent(Number(s.correct), attempted)}% accuracy{score !== null && <> · <span className={`tone-${level.tone}`}>{score}</span></>}</>
              : topic.desc}
          </span>
        </span>
        {meta}
        {locked && count !== 0 && <span className="topic-lock" title={locked}><Lock size={13} aria-label={locked} /></span>}
        {free && <span className="topic-free">Free</span>}
        <ChevronRight size={16} className="chev" aria-hidden="true" />
      </a>
    </li>
  )
}

const LOCK_NOTE = { none: 'Needs a Practice plan', mains: 'Needs a Prelims + Mains plan' }

// `access`: the student's Practice access level (see lib/practice.js); the
// topics their plan doesn't open get a lock, and with no plan the free ones a tag.
export function TopicGroups({ subject, mode, counts, stats, pathFor, notes, access }) {
  // Drills that live on their own screen have no revision notes.
  const groups = subject.groups
    .map((g) => ({ ...g, topics: mode === 'learn' ? g.topics.filter((t) => t.practice !== 'link') : g.topics }))
    .filter((g) => g.topics.length > 0)
  return groups.map((g) => (
    <section key={g.title} className="topic-group">
      <h2 className="section-title">{g.title}</h2>
      <ul className="card topic-list">
        {g.topics.map((t) => (
          <TopicRow
            key={t.key}
            topic={t}
            mode={mode}
            to={pathFor(t)}
            count={counts ? (counts[t.key] || 0) : undefined}
            stats={stats}
            hasNotes={notes ? !!notes[t.key] : false}
            locked={mode === 'practice' && t.practice === 'quiz' && LOCK_NOTE[levelFor(t.key, access)]}
            free={mode === 'practice' && t.practice === 'quiz' && access === 'none' && isFreeTopic(t.key)}
          />
        ))}
      </ul>
    </section>
  ))
}
