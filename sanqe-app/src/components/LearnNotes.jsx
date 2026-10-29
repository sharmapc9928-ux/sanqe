import { useState } from 'react'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { useApp } from '../lib/appContext'
import { RichText } from './RichText'

// Revision notes from the learn_notes table, in English or Hinglish.
// Rows arrive in display order; a 'section' row starts a new card and the
// rows after it belong to that card. Hinglish falls back to English when a
// row has no Hinglish text.

const LEVELS = {
  prelims: { label: 'Prelims', hue: 'teal' },
  mains: { label: 'Mains', hue: 'amber' },
  advanced: { label: 'Advanced', hue: 'violet' },
}

export const pickLang = (en, hi, lang) => (lang === 'hi' ? hi || en : en || hi)

export function notesIntro(notes, lang) {
  const intro = notes.find((n) => n.kind === 'intro')
  return intro ? pickLang(intro.body, intro.body_hi, lang) : null
}

function groupSections(notes) {
  const sections = []
  for (const n of notes) {
    if (n.kind === 'intro') continue
    if (n.kind === 'section' || sections.length === 0) {
      sections.push({ head: n.kind === 'section' ? n : null, items: [] })
      if (n.kind === 'section') continue
    }
    sections[sections.length - 1].items.push(n)
  }
  return sections
}

export function LangSwitch() {
  const { lang, setLang } = useApp()
  return (
    <div className="lang-switch" role="radiogroup" aria-label="Notes language">
      <button type="button" role="radio" aria-checked={lang !== 'hi'} className={lang !== 'hi' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
      <button type="button" role="radio" aria-checked={lang === 'hi'} className={lang === 'hi' ? 'active' : ''} onClick={() => setLang('hi')}>Hinglish</button>
    </div>
  )
}

function Text({ value, className }) {
  if (!value) return null
  return <p className={className}><RichText text={value} /></p>
}

function Working({ value }) {
  if (!value) return null
  return <pre className="note-working"><RichText text={value} /></pre>
}

function Tip({ value }) {
  if (!value) return null
  return (
    <p className="note-tip">
      <Lightbulb size={15} aria-hidden="true" />
      <span><RichText text={value} /></span>
    </p>
  )
}

function Answer({ value }) {
  if (!value) return null
  return <p className="note-answer"><span>Answer</span> <RichText text={value} /></p>
}

function Level({ value }) {
  const level = LEVELS[value]
  if (!level) return null
  return <span className={`pill hue-${level.hue}`}>{level.label}</span>
}

function Concept({ note, lang }) {
  const title = pickLang(note.title, note.title_hi, lang)
  return (
    <div className="note-block">
      {title && <h3>{title}</h3>}
      <Text className="note-body" value={pickLang(note.body, note.body_hi, lang)} />
      <Working value={note.working} />
      <Tip value={pickLang(note.tip, note.tip_hi, lang)} />
    </div>
  )
}

function Example({ note, lang, number }) {
  const title = pickLang(note.title, note.title_hi, lang)
  return (
    <div className="note-block note-example">
      <div className="note-example-head">
        <h3>Example {number}{title ? ` · ${title}` : ''}</h3>
        <Level value={note.level} />
      </div>
      <Text className="note-question" value={pickLang(note.body, note.body_hi, lang)} />
      <Working value={note.working} />
      <Tip value={pickLang(note.tip, note.tip_hi, lang)} />
      <Answer value={note.answer} />
    </div>
  )
}

function Practice({ note, lang, number }) {
  const [open, setOpen] = useState(false)
  const hasSolution = note.working || note.answer
  return (
    <div className="note-block note-practice">
      <div className="note-example-head">
        <h3>Q{number}</h3>
        <Level value={note.level} />
      </div>
      <Text className="note-question" value={pickLang(note.body, note.body_hi, lang)} />
      {hasSolution && (
        <div className={`solution${open ? ' open' : ''}`}>
          <button type="button" className="solution-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Lightbulb size={15} />
            <span>{open ? 'Answer' : 'Show answer'}</span>
            <ChevronDown size={15} className="solution-caret" />
          </button>
          {open && (
            <div className="solution-body">
              <Working value={note.working} />
              <Answer value={note.answer} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function LearnNotes({ notes }) {
  const { lang } = useApp()
  const sections = groupSections(notes)
  let example = 0

  return (
    <>
      <div className="notes-bar">
        <span className="eyebrow">Notes language</span>
        <LangSwitch />
      </div>
      {sections.map((sec, i) => {
        let practice = 0
        return (
          <section key={sec.head?.id ?? `s${i}`} className="card learn-section">
            {sec.head && <h2>{pickLang(sec.head.title, sec.head.title_hi, lang)}</h2>}
            {sec.items.map((n) => {
              if (n.kind === 'example') return <Example key={n.id} note={n} lang={lang} number={++example} />
              if (n.kind === 'practice') return <Practice key={n.id} note={n} lang={lang} number={++practice} />
              if (n.kind === 'tip') return <div key={n.id} className="note-block"><Tip value={pickLang(n.body, n.body_hi, lang)} /></div>
              return <Concept key={n.id} note={n} lang={lang} />
            })}
          </section>
        )
      })}
    </>
  )
}
