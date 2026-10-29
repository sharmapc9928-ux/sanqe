import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CalendarClock, CheckCheck, NotebookPen } from 'lucide-react'
import { Page } from '../components/Layout'
import { Solution } from '../components/Solution'
import { QuestionBody } from '../components/Question'
import { RichText } from '../components/RichText'
import { ReportQuestion } from '../components/ReportQuestion'
import { EmptyState, Modal, SkeletonCards } from '../components/ui'
import { useApp } from '../lib/appContext'
import { fetchReviewQueue, removeFromReview } from '../lib/api'
import { linkProps, navigate } from '../lib/router'
import { TOPIC_BY_KEY } from '../lib/topics'
import { formatShortDate } from '../lib/format'
import { newReviewRun } from './practiceRun'

const REVIEW_BATCH = 20

export default function ReviewNotebook() {
  const { setPractice, refreshStats } = useApp()
  const [items, setItems] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | unavailable | error
  const [error, setError] = useState('')
  const [tab, setTab] = useState('due')
  const [removing, setRemoving] = useState(null)

  const load = useCallback(async () => {
    try {
      setItems(await fetchReviewQueue())
      setState('ready')
    } catch (e) {
      setState(e.missingSchema ? 'unavailable' : 'error')
      setError(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const now = Date.now()
  const due = (items || []).filter((i) => new Date(i.due_at).getTime() <= now)
  const shown = tab === 'due' ? due : items || []

  const startReview = (list) => {
    const questions = list.slice(0, REVIEW_BATCH).map((i) => ({ ...i.question, topic: i.topic }))
    if (questions.length === 0) return
    setPractice(newReviewRun(questions))
    navigate('/review/quiz')
  }

  const confirmRemove = async () => {
    const item = removing
    setRemoving(null)
    try {
      await removeFromReview(item.topic, item.question_id)
      setItems((prev) => prev.filter((i) => !(i.topic === item.topic && i.question_id === item.question_id)))
      refreshStats()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Page backTo="/practice" title="Mistake Notebook" subtitle="Every question you get wrong comes back after 1 day, then 3, then 7. Three correct reviews and it's mastered.">
      {state === 'loading' && <SkeletonCards count={3} height={110} />}

      {state === 'unavailable' && (
        <EmptyState icon={NotebookPen} title="Notebook is being set up">
          Your mistakes will start collecting here shortly. Keep practising — nothing you do now is lost.
        </EmptyState>
      )}
      {state === 'error' && <p className="error" role="alert">{error}</p>}

      {state === 'ready' && items.length === 0 && (
        <EmptyState
          icon={CheckCheck}
          title="No mistakes saved yet"
          action={<a className="btn primary" {...linkProps('/practice')}>Start practising <ArrowRight size={15} /></a>}
        >
          Get a question wrong in any practice test and it lands here automatically, ready for spaced review.
        </EmptyState>
      )}

      {state === 'ready' && items.length > 0 && (
        <>
          <div className="card review-cta">
            <div>
              <strong>{due.length > 0 ? `${due.length} question${due.length === 1 ? '' : 's'} due for review` : 'Nothing due right now'}</strong>
              <span className="muted small">
                {due.length > 0
                  ? `Review up to ${REVIEW_BATCH} at a time — untimed, with solutions.`
                  : `Next one is due ${formatShortDate(items[0].due_at)}. You can still revise all ${items.length} now.`}
              </span>
            </div>
            <button type="button" className="btn primary" onClick={() => startReview(due.length > 0 ? due : items)}>
              {due.length > 0 ? 'Start review' : 'Revise all'} <ArrowRight size={15} />
            </button>
          </div>

          <div className="segmented" role="radiogroup" aria-label="Show">
            <button type="button" role="radio" aria-checked={tab === 'due'} className={tab === 'due' ? 'active' : ''} onClick={() => setTab('due')}>Due ({due.length})</button>
            <button type="button" role="radio" aria-checked={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All ({items.length})</button>
          </div>

          {shown.length === 0 && <p className="muted">Nothing due. Come back later, or switch to “All”.</p>}
          <ul className="review-items">
            {shown.map((item) => {
              const q = item.question
              const topic = TOPIC_BY_KEY[item.topic]
              const isDue = new Date(item.due_at).getTime() <= now
              return (
                <li key={`${item.topic}:${item.question_id}`} className="card review-item">
                  <div className="review-head">
                    <span className={`pill hue-${topic?.hue}`}>{topic?.short}</span>
                    <span className="box-dots" aria-label={`${item.box} of 3 correct reviews`}>
                      {[0, 1, 2].map((d) => <span key={d} className={d < item.box ? 'on' : ''} />)}
                    </span>
                    <span className={`muted small due-label${isDue ? ' is-due' : ''}`}>
                      <CalendarClock size={13} /> {isDue ? 'Due now' : `Due ${formatShortDate(item.due_at)}`}
                    </span>
                  </div>
                  <QuestionBody question={q} compact />
                  <p className="review-answers"><span className="ok">Answer: ({q.correct_option.toUpperCase()}) <RichText text={q[`option_${q.correct_option}`]} /></span></p>
                  <div className="review-foot">
                    <Solution question={q} />
                    <ReportQuestion topic={item.topic} questionId={item.question_id} />
                    <button type="button" className="link-btn small" onClick={() => setRemoving(item)}>Mark as mastered</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove from notebook?"
        actions={(
          <>
            <button type="button" className="btn ghost" onClick={() => setRemoving(null)}>Cancel</button>
            <button type="button" className="btn primary" onClick={confirmRemove}>Yes, I&apos;ve got it</button>
          </>
        )}
      >
        <p>This question won&apos;t come back for review. If you get it wrong again later, it&apos;ll return automatically.</p>
      </Modal>
    </Page>
  )
}
