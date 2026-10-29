import { useEffect, useState } from 'react'
import { ArrowRight, NotebookText, WifiOff } from 'lucide-react'
import { Page } from '../components/Layout'
import { linkProps, navigate } from '../lib/router'
import { SUBJECT_BY_KEY, liveSubject, liveTopic, practicePath } from '../lib/syllabus'
import { EmptyState, SkeletonCards } from '../components/ui'
import { LearnNotes, notesIntro } from '../components/LearnNotes'
import { fetchLearnNotes } from '../lib/api'
import { useApp } from '../lib/appContext'
import { CUBES, FRACTIONS, LEARN, SQUARES } from '../content/learn'

const TABLES = {
  squares: { title: 'Squares 1–30', rows: SQUARES.map((r) => [`${r.n}²`, r.v]) },
  cubes: { title: 'Cubes 1–20', rows: CUBES.map((r) => [`${r.n}³`, r.v]) },
  fractions: { title: 'Fraction → percentage', rows: FRACTIONS.map((r) => [r.label, `${r.v}%`]) },
}

export default function LearnTopic({ params }) {
  const topic = liveTopic(params.topic)
  const valid = topic && topic.subject === params.subject && topic.practice !== 'link'
  const { lang } = useApp()
  // Notes from the learn_notes table win over the sheets bundled with the app.
  const [notes, setNotes] = useState(null)
  const [notesError, setNotesError] = useState(null)
  useEffect(() => {
    if (!valid) return undefined
    let live = true
    setNotes(null)
    setNotesError(null)
    fetchLearnNotes(params.topic)
      .then((rows) => { if (live) setNotes(rows) })
      .catch((e) => { if (live) { setNotes([]); setNotesError(e.message) } })
    return () => { live = false }
  }, [valid, params.topic])

  const hasNotes = notes !== null && notes.length > 0
  const sheet = notes !== null && !hasNotes ? LEARN[params.topic] : null
  useEffect(() => {
    if (!valid) navigate(liveSubject(params.subject) ? `/learn/${params.subject}` : '/learn', { replace: true, force: true })
  }, [valid, params.subject])
  if (!valid) return null

  return (
    <Page backTo={`/learn/${topic.subject}`}>
      <div className={`topic-hero hue-${topic.hue}`}>
        <span className="subject-tile big"><topic.Icon size={26} /></span>
        <div>
          <p className="eyebrow">{SUBJECT_BY_KEY[topic.subject].short} · {topic.group}</p>
          <h1 className="heading">{topic.name}</h1>
          <p className="subheading">{(hasNotes && notesIntro(notes, lang)) || (sheet ? sheet.intro : topic.desc)}</p>
        </div>
      </div>

      {notes === null && <SkeletonCards count={3} height={140} />}

      {hasNotes && <LearnNotes notes={notes} />}

      {notes !== null && !hasNotes && !sheet && notesError && (
        <EmptyState icon={WifiOff} title="Couldn't load the notes">{notesError}</EmptyState>
      )}

      {notes !== null && !hasNotes && !sheet && !notesError && (
        <EmptyState icon={NotebookText} title="Notes coming soon">
          Revision notes for {topic.name} are being written. You can already practise the topic.
        </EmptyState>
      )}

      {sheet && sheet.sections.map((sec) => (
        <section key={sec.title} className="card learn-section">
          <h2>{sec.title}</h2>
          <ul>
            {sec.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>
      ))}

      {sheet && sheet.tables.map((key) => {
        const t = TABLES[key]
        return (
          <section key={key} className="card learn-section">
            <h2>{t.title}</h2>
            <dl className="value-table">
              {t.rows.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
        )
      })}

      <a className="btn primary big learn-practice" {...linkProps(practicePath(topic))}>
        Practise {topic.name} <ArrowRight size={16} />
      </a>
    </Page>
  )
}
