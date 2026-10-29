import { useState } from 'react'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { useApp } from '../lib/appContext'
import { RichText } from './RichText'

// Worked solution for a practice question, in English or Hinglish.
// Renders nothing for questions that don't have an explanation yet.
export function Solution({ question, defaultOpen = false }) {
  const { lang, setLang } = useApp()
  const [open, setOpen] = useState(defaultOpen)
  const en = question?.explanation
  const hi = question?.explanation_hi
  if (!en && !hi) return null
  const text = lang === 'hi' ? hi || en : en || hi

  return (
    <div className={`solution${open ? ' open' : ''}`}>
      <button type="button" className="solution-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Lightbulb size={15} />
        <span>{open ? 'Solution' : 'Show solution'}</span>
        <ChevronDown size={15} className="solution-caret" />
      </button>
      {open && (
        <div className="solution-body">
          {en && hi && (
            <div className="lang-switch" role="radiogroup" aria-label="Solution language">
              <button type="button" role="radio" aria-checked={lang !== 'hi'} className={lang !== 'hi' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
              <button type="button" role="radio" aria-checked={lang === 'hi'} className={lang === 'hi' ? 'active' : ''} onClick={() => setLang('hi')}>Hinglish</button>
            </div>
          )}
          <p className="solution-text"><RichText text={text} /></p>
        </div>
      )}
    </div>
  )
}
