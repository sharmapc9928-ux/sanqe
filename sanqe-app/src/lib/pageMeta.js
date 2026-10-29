import { matchPath } from './router'
import { SUBJECT_BY_KEY, TOPIC_BY_KEY } from './syllabus'
import { EXAMS } from './descriptive'

// Title and meta description for every screen. App sets them on each route
// change; the server uses the same ones for the pages it renders
// (entry-server.jsx).

export const SITE = 'Fedge Sanqe'
export const DEFAULT_DESCRIPTION = 'Topic-wise practice for Quant, Reasoning, English and Computer, Pomodoro focus sessions, a daily challenge and AI-marked descriptive mocks for SBI and IBPS PO, Clerk and RRB.'

const EXAMS_LINE = 'SBI and IBPS PO, Clerk and RRB'

const subjectName = (p) => SUBJECT_BY_KEY[p.subject]?.name || 'Subject'
const topic = (p) => TOPIC_BY_KEY[p.topic]
const topicName = (p) => topic(p)?.name || 'Topic'
const examName = (p) => EXAMS[p.exam]?.name || 'Descriptive'

// [pattern, (params) => [title, description]]. First match wins, as in App.
const PAGES = [
  ['/', () => [`${SITE} — Find your edge`, DEFAULT_DESCRIPTION]],
  ['/login', () => ['Log in', `Log in to ${SITE} to keep your practice, streak, mistakes and your coaching’s mocks in one place.`]],
  ['/practice', () => ['Practice', `Topic-wise practice for Quant, Reasoning, English and Computer, laid out like the ${EXAMS_LINE} syllabus.`]],
  ['/practice/:subject', (p) => [`${subjectName(p)} practice`, `Every ${subjectName(p)} topic for ${EXAMS_LINE}, with timed practice and a speed score for each.`]],
  ['/practice/:subject/:topic', (p) => [`${topicName(p)} practice`, `${topic(p)?.desc ? `${topic(p).desc}. ` : ''}Timed ${topicName(p)} questions for ${EXAMS_LINE}.`]],
  ['/practice/:subject/:topic/quiz', (p) => [`${topicName(p)} quiz`, `A timed ${topicName(p)} practice run.`]],
  ['/practice/:subject/:topic/results', (p) => [`${topicName(p)} results`, `Accuracy, pace and a question-by-question review of your ${topicName(p)} run.`]],
  ['/plans', () => ['Practice plans', `Four Practice plans: Prelims or Prelims + Mains, for 3 months or a year. Every Prelims topic in Quant, Reasoning and English with explanations; Prelims + Mains adds the Mains topics (Computer included) and the mistake notebook. Average, Syllogism and the speed maths drills are free.`]],
  ['/focus', () => ['Focus timer', 'Pomodoro (25/5) and 52/17 focus sessions that keep running across the app.']],
  ['/review', () => ['Mistake notebook', 'Every question you got wrong, brought back at 1, 3 and 7 days until it sticks.']],
  ['/review/quiz', () => ['Mistake review', 'Revising the questions you got wrong.']],
  ['/review/results', () => ['Review results', 'How your mistake review went.']],
  ['/speed', () => ['Circle Game', 'A 60-second mental addition drill. Add all ten numbers around the circle as fast as you can.']],
  ['/daily', () => ['Daily challenge', 'The same 10 questions for everyone each day, one attempt, with a leaderboard.']],
  ['/daily/play', () => ['Daily challenge paper', 'Today’s daily challenge, in progress.']],
  ['/learn', () => ['Learn', `Revision notes for every subject and topic of ${EXAMS_LINE}.`]],
  ['/learn/:subject', (p) => [`${subjectName(p)} notes`, `Revision notes for every ${subjectName(p)} topic.`]],
  ['/learn/:subject/:topic', (p) => [`${topicName(p)} notes`, `${topicName(p)}: concepts, shortcuts and solved examples for ${EXAMS_LINE}.`]],
  ['/mocks', () => ['Mock tests', 'Full-length bank exam mocks by exam, with score, rank and solutions, and AI-marked descriptive mocks for IBPS PO and SBI PO.']],
  ['/mocks/results', () => ['Descriptive results', 'Scores, grammar marks and improved versions of your essays and letters.']],
  ['/mocks/:exam', (p) => [`${examName(p)} descriptive mocks`, `Timed ${examName(p)} descriptive mocks with AI evaluation.`]],
  ['/mocks/:exam/:mock', (p) => [`${examName(p)} descriptive mock ${p.mock}`, `Instructions for ${examName(p)} descriptive mock ${p.mock}.`]],
  ['/mocks/:exam/:mock/test', (p) => [`${examName(p)} descriptive mock ${p.mock} — test`, `${examName(p)} descriptive mock ${p.mock}, in progress.`]],
  ['/series/:series', () => ['Test series', 'The mocks in this test series, your attempts and your rank.']],
  ['/series/:series/:mock', () => ['Mock instructions', 'Sections, timing and marking for this mock.']],
  ['/series/:series/:mock/test', () => ['Mock test', 'A full-length mock in progress.']],
  ['/series/:series/:mock/result', () => ['Mock result', 'Your score, section-wise analysis and rank for this mock.']],
  ['/courses', () => ['Courses', 'The coachings you have joined and the test series you have unlocked.']],
  ['/for-coaching', () => ['Sanqe for coachings — your test series, your name on it', 'Run your coaching’s bank exam mocks on Fedge Sanqe: your own page, sectional timers, negative marking, instant results with rank, and Fedge mocks for SBI and IBPS exams.']],
  ['/contact', () => ['Contact us', `Questions about ${SITE}, your coaching’s portal, or something that isn’t working? Send us a message and we reply by email.`]],
  ['/partner', () => ['Become a partner', `Register your coaching as a ${SITE} partner.`]],
  ['/admin', () => ['Admin', 'Questions, reports and coachings.']],
  ['/coach', () => ['Coaching portal', 'Your test series, mocks, students and results.']],
  ['/coach/apply', () => ['Open your coaching portal', 'Set up your coaching on Fedge Sanqe.']],
  ['/coach/plan', () => ['Portal plan', 'Choose a monthly or yearly plan for your coaching portal.']],
  ['/coach/details', () => ['Coaching details', 'Your coaching’s business details.']],
  ['/coach/series/:series', () => ['Edit test series', 'Mocks, price, access codes and students of this test series.']],
  ['/coach/mocks/:mock', () => ['Edit mock', 'Sections, questions, settings and results of this mock.']],
]

const cleanPath = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path)

// { title, description, path } — path is the canonical one (no trailing slash).
export function metaFor(path) {
  const clean = cleanPath(path)
  for (const [pattern, make] of PAGES) {
    const params = matchPath(pattern, clean)
    if (!params) continue
    const [title, description] = make(params)
    // Titles that already name the product don't repeat it.
    return { title: title.includes('Sanqe') ? title : `${title} · ${SITE}`, description, path: clean }
  }
  return { title: SITE, description: DEFAULT_DESCRIPTION, path: clean }
}

function headTag(selector, create) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  return el
}

// Updates the title, description, canonical link and link-preview tags in
// <head> (the server writes the same ones, see entry-server.jsx).
export function applyMeta({ title, description, path }) {
  document.title = title
  const url = `${window.location.origin}${path ?? cleanPath(window.location.pathname)}`
  const meta = (attr, key, value) => {
    headTag(`meta[${attr}="${key}"]`, () => {
      const m = document.createElement('meta')
      m.setAttribute(attr, key)
      return m
    }).setAttribute('content', value)
  }
  meta('name', 'description', description)
  meta('property', 'og:title', title)
  meta('property', 'og:description', description)
  meta('property', 'og:url', url)
  headTag('link[rel="canonical"]', () => {
    const l = document.createElement('link')
    l.rel = 'canonical'
    return l
  }).href = url
}
