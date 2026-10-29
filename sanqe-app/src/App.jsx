import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { supabase } from './supabaseClient'
import { AppContext } from './lib/appContext'
import { matchPath, navigate, usePath } from './lib/router'
import { fetchStats, fetchTopicCounts } from './lib/api'
import { fetchIsAdmin } from './lib/admin'
import { loadFocus } from './lib/focus'
import { applyMeta, metaFor } from './lib/pageMeta'
import { LANG_KEY, readStore, takeReturnTo, THEME_KEY, userKey, writeStore } from './lib/storage'
import { NavBar, ProfilePanel } from './components/Layout'
import Login from './screens/Login'
import ResetPassword from './screens/ResetPassword'
import DreamJobPrompt from './screens/DreamJobPrompt'
import Dashboard from './screens/Dashboard'
import PracticeHub from './screens/PracticeHub'
import SubjectPractice from './screens/SubjectPractice'
import FocusTimer from './screens/FocusTimer'
import TopicSetup from './screens/TopicSetup'
import Quiz from './screens/Quiz'
import Results from './screens/Results'
import ReviewNotebook from './screens/ReviewNotebook'
import SpeedGame from './screens/SpeedGame'
import DailyChallenge from './screens/DailyChallenge'
import DailyPlay from './screens/DailyPlay'
import LearnHub from './screens/LearnHub'
import LearnTopic from './screens/LearnTopic'
import LearnSubject from './screens/LearnSubject'
import MocksHub from './screens/MocksHub'
import MockList from './screens/MockList'
import MockExamFlow from './screens/MockExamFlow'
import MockInstructions from './screens/MockInstructions'
import DescriptiveTest from './screens/DescriptiveTest'
import DescriptiveResultsList from './screens/DescriptiveResultsList'
import SeriesDetail from './screens/SeriesDetail'
import SeriesMockInstructions from './screens/SeriesMockInstructions'
import SeriesMockTest from './screens/SeriesMockTest'
import SeriesMockResult from './screens/SeriesMockResult'
import SeriesMockAnalysis from './screens/SeriesMockAnalysis'
import ForCoaching from './screens/ForCoaching'
import Courses from './screens/Courses'
import FedgeAccess from './screens/FedgeAccess'
import CourseLock from './screens/CourseLock'
import PlanLock from './screens/PlanLock'
import PracticePlans from './screens/PracticePlans'
import Contact from './screens/Contact'
import { fetchHasCourse } from './lib/coaching'
import { accessLevel, fetchMyPracticePass, isPaid } from './lib/practice'
import { isFreeTopic } from './lib/syllabus'

// Only admins / coachings open these, so they are downloaded on demand.
const Admin = lazy(() => import('./screens/Admin'))
const CoachHome = lazy(() => import('./screens/coach/CoachHome'))
const CoachApply = lazy(() => import('./screens/coach/CoachHome').then((m) => ({ default: m.CoachApply })))
const CoachPlan = lazy(() => import('./screens/coach/CoachHome').then((m) => ({ default: m.CoachPlan })))
const CoachDetails = lazy(() => import('./screens/coach/CoachHome').then((m) => ({ default: m.CoachDetails })))
const PartnerApply = lazy(() => import('./screens/PartnerApply'))
const CoachSeries = lazy(() => import('./screens/coach/CoachSeries'))
const CoachMock = lazy(() => import('./screens/coach/CoachMock'))

// [pattern, component, showsNav]. First match wins, so fixed paths come
// before ":param" ones at the same depth.
const ROUTES = [
  ['/', Dashboard, true],
  ['/practice', PracticeHub, true],
  ['/practice/:subject', SubjectPractice, true],
  ['/practice/:subject/:topic', TopicSetup, true],
  ['/practice/:subject/:topic/quiz', Quiz, false],
  ['/practice/:subject/:topic/results', Results, false],
  ['/plans', PracticePlans, true],
  ['/focus', FocusTimer, true],
  ['/review', ReviewNotebook, true],
  ['/review/quiz', Quiz, false],
  ['/review/results', Results, false],
  ['/speed', SpeedGame, true],
  ['/daily', DailyChallenge, true],
  ['/daily/play', DailyPlay, false],
  ['/learn', LearnHub, true],
  ['/learn/:subject', LearnSubject, true],
  ['/learn/:subject/:topic', LearnTopic, true],
  ['/mocks', MocksHub, true],
  ['/mocks/results', DescriptiveResultsList, true],
  ['/mocks/exam/:slug', MockExamFlow, true],
  ['/mocks/exam/:slug/:stage', MockExamFlow, true],
  ['/mocks/exam/:slug/:stage/:type', MockExamFlow, true],
  ['/mocks/:exam', MockList, true],
  ['/mocks/:exam/:mock', MockInstructions, false],
  ['/mocks/:exam/:mock/test', DescriptiveTest, false],
  ['/series/:series', SeriesDetail, true],
  ['/series/:series/:mock', SeriesMockInstructions, false],
  ['/series/:series/:mock/test', SeriesMockTest, false],
  ['/series/:series/:mock/result', SeriesMockResult, true],
  ['/series/:series/:mock/analysis', SeriesMockAnalysis, false],
  ['/courses', Courses, true],
  ['/unlock', FedgeAccess, true],
  ['/for-coaching', ForCoaching, false],
  ['/contact', Contact, true],
  ['/partner', PartnerApply, true],
  ['/admin', Admin, true],
  ['/coach', CoachHome, true],
  ['/coach/apply', CoachApply, true],
  ['/coach/plan', CoachPlan, true],
  ['/coach/details', CoachDetails, true],
  ['/coach/series/:series', CoachSeries, true],
  ['/coach/mocks/:mock', CoachMock, true],
]

// Sections a student gets only once they have a course. The Circle Game and
// the free speed maths drills on the home screen stay open, and so do the
// Mock Tests screen and the objective mocks on it (/series/...); only the
// descriptive mocks under /mocks need a course.
const COURSE_ONLY = ['/daily', '/learn', '/mocks/results', '/mocks/:exam']
// The focus timer comes with any Practice plan, the notebook only with
// Prelims + Mains (a course gives both). Practice itself is open to look at:
// which topics a student can start is decided on the topic's own screen.
const PAID_ONLY = ['/focus']
const FULL_PLAN_ONLY = ['/review']

const underAny = (list, pattern) => list.some((p) => pattern === p || pattern.startsWith(`${p}/`))

// 'full' | 'paid' | null: which plan a route needs.
const planNeeded = (pattern) => {
  if (underAny(FULL_PLAN_ONLY, pattern)) return 'full'
  return underAny(PAID_ONLY, pattern) ? 'paid' : null
}

function resolve(path) {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path
  for (const [pattern, Component, nav] of ROUTES) {
    const params = matchPath(pattern, clean)
    if (params) return { Component, params, nav, needsCourse: underAny(COURSE_ONLY, pattern), needsPlan: planNeeded(pattern) }
  }
  return null
}

const THEME_COLORS = { light: '#ffffff', cream: '#f4eee1', dark: '#12141f' }

function readTheme() {
  try {
    const t = window.localStorage.getItem(THEME_KEY)
    return THEME_COLORS[t] ? t : 'light'
  } catch {
    return 'light'
  }
}

export default function App({ initialSession }) {
  const path = usePath()
  // undefined = checking, null = signed out. main.jsx passes the session in
  // when it already looked it up (server-rendered pages), so the first render
  // isn't the boot splash.
  const [session, setSession] = useState(initialSession)
  const [recovery, setRecovery] = useState(false)

  // Each screen's own title, description and canonical link. A layout effect,
  // so it runs before a screen's own effects (a coaching's page then puts in
  // the coaching's name).
  useLayoutEffect(() => { applyMeta(metaFor(path)) }, [path])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') navigate('/', { replace: true, force: true })
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const [theme, setThemeState] = useState(readTheme)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
    try { window.localStorage.setItem(THEME_KEY, theme) } catch { /* storage unavailable */ }
  }, [theme])

  if (session === undefined) return <div className="boot-splash" aria-busy="true" />
  if (recovery) return <ResetPassword onDone={() => setRecovery(false)} />
  if (!session) return <GuestApp path={path} theme={theme} setTheme={setThemeState} />

  // Keyed by user so nothing (quiz state, drafts, flags) leaks between accounts.
  return <SignedInApp key={session.user.id} user={session.user} theme={theme} setTheme={setThemeState} />
}

const noop = () => {}

// Signed out, these open without an account: the home screen (Circle Game,
// speed maths), Practice to look through (the hub, a subject's topics and a
// topic's page, which asks for a plan on the paid ones), the quiz and results
// of the free topics (Average, Syllogism and the speed maths drills; nothing is saved),
// the Circle Game, the plans, a coaching's public page, the pitch to
// coachings and the contact form. Every other screen shows the login, and after logging in the student
// lands on the screen they asked for.
const GUEST_ROUTES = [
  ['/practice', PracticeHub, true],
  ['/practice/:subject', SubjectPractice, true],
  ['/practice/:subject/:topic', TopicSetup, true],
  ['/speed', SpeedGame, true],
  ['/plans', PracticePlans, true],
]
const GUEST_FREE_ROUTES = [
  ['/practice/:subject/:topic/quiz', Quiz, false],
  ['/practice/:subject/:topic/results', Results, false],
]

function resolveGuest(clean) {
  if (clean === '/contact') return { Component: Contact, params: {}, nav: true }
  for (const [pattern, Component, nav] of GUEST_ROUTES) {
    const params = matchPath(pattern, clean)
    if (params) return { Component, params, nav }
  }
  for (const [pattern, Component, nav] of GUEST_FREE_ROUTES) {
    const params = matchPath(pattern, clean)
    if (params && isFreeTopic(params.topic)) return { Component, params, nav }
  }
  return null
}

// Also rendered on the server for the public pages (entry-server.jsx).
export function GuestApp({ path, theme, setTheme }) {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path
  const home = clean === '/'
  const route = home ? null : resolveGuest(clean)
  const withNav = home || !!route?.nav
  useEffect(() => {
    document.body.classList.toggle('has-sidebar', withNav)
    return () => document.body.classList.remove('has-sidebar')
  }, [withNav])

  // Same in-memory practice run as when signed in (see SignedInApp).
  const [practice, setPracticeState] = useState(null)
  const setPractice = useCallback((run) => { flushSync(() => setPracticeState(run)) }, [])

  // Question counts for the Practice screens, so topics show how many
  // questions they have (optional: without them the counts are left out).
  const [counts, setCounts] = useState(null)
  const inPractice = clean.startsWith('/practice')
  useEffect(() => {
    if (!inPractice) return
    fetchTopicCounts().then(setCounts).catch(() => { /* counts are optional */ })
  }, [inPractice])

  const ctx = useMemo(() => ({
    user: null,
    guest: true,
    theme,
    setTheme,
    lang: 'en',
    setLang: noop,
    stats: null,
    statsState: 'unavailable',
    refreshStats: noop,
    counts,
    refreshCounts: noop,
    isAdmin: false,
    practice,
    setPractice,
    mode: 'student',
    hasCourse: false,
    refreshHasCourse: noop,
    practiceAccess: 'none',
    practicePass: null,
    refreshPass: noop,
    openProfile: () => navigate('/login'),
  }), [theme, setTheme, counts, practice, setPractice])

  if (clean === '/for-coaching') return <ForCoaching />
  if (!home && !route) return <Login />
  return (
    <AppContext.Provider value={ctx}>
      {home ? <Dashboard /> : <route.Component params={route.params} path={clean} />}
      {withNav && <NavBar />}
    </AppContext.Provider>
  )
}

function SignedInApp({ user, theme, setTheme }) {
  // Back to where the student was before logging in (the coaching portal). Swapped in before the first render, so the home
  // screen never flashes.
  useState(() => {
    const r = takeReturnTo()
    const at = window.location.pathname
    const to = r?.path || (at === '/login' ? '/' : at)
    if (to !== at) window.history.replaceState({ idx: 0 }, '', to)
  })
  const path = usePath()

  // The coaching portal (/coach) and the partner form (/partner) are the
  // teacher side; everything else, including the home screen after logging
  // in, is the student side.
  const mode = /^\/(coach|partner)(\/|$)/.test(path) ? 'teacher' : 'student'

  const [profileOpen, setProfileOpen] = useState(false)
  const [lang, setLangState] = useState(() => (readStore(LANG_KEY, 'en') === 'hi' ? 'hi' : 'en'))
  const setLang = useCallback((l) => { setLangState(l); writeStore(LANG_KEY, l) }, [])

  // Practice/review run in memory; Results reads the finished run from here.
  // Committed synchronously: callers navigate right after setting it, and the
  // router's URL change renders synchronously — without flushSync the next
  // screen would render with the previous run and redirect away.
  const [practice, setPracticeState] = useState(null)
  const setPractice = useCallback((run) => { flushSync(() => setPracticeState(run)) }, [])

  // Dashboard stats. 'unavailable' = the progress tables aren't on the
  // database yet; screens then hide stats instead of showing errors.
  const [stats, setStats] = useState(null)
  const [statsState, setStatsState] = useState('loading')
  const refreshStats = useCallback(async () => {
    try {
      setStats(await fetchStats())
      setStatsState('ready')
    } catch (e) {
      setStatsState(e.missingSchema ? 'unavailable' : 'error')
    }
  }, [])
  useEffect(() => { refreshStats() }, [refreshStats])

  // Questions per topic (null until loaded or when the database can't say).
  const [counts, setCounts] = useState(null)
  const refreshCounts = useCallback(async () => {
    try { setCounts(await fetchTopicCounts()) } catch { /* counts are optional */ }
  }, [])
  useEffect(() => { refreshCounts() }, [refreshCounts])

  // Whether the student has a course yet (null = checking). The database
  // enforces the lock on the content itself, so if this check fails the screens
  // stay locked (fail closed) rather than showing paid screens that would load empty.
  const [hasCourse, setHasCourse] = useState(null)
  const refreshHasCourse = useCallback(async () => {
    try { setHasCourse(await fetchHasCourse(user.id)) } catch { setHasCourse(false) }
  }, [user.id])
  useEffect(() => { refreshHasCourse() }, [refreshHasCourse])

  // Admin screen access (null = checking). The database enforces it too.
  const [isAdmin, setIsAdmin] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchIsAdmin().then((v) => { if (!cancelled) setIsAdmin(v) })
    return () => { cancelled = true }
  }, [])

  // The student's Practice plan: { tier, until } (null = checking). Unlike the
  // course check this fails closed: if it can't be read there is no plan until
  // the plans page or a reload asks again.
  const [practicePass, setPracticePass] = useState(null)
  const refreshPass = useCallback(async () => {
    try { setPracticePass(await fetchMyPracticePass()) } catch { setPracticePass({ tier: null, until: null }) }
  }, [])
  useEffect(() => { refreshPass() }, [refreshPass])
  const practiceAccess = accessLevel({ hasCourse, isAdmin, pass: practicePass })

  // Focus timer state belongs to this account.
  useState(() => loadFocus(user.id))

  // One-time "target exam" question after the first login.
  const doneKey = userKey(user.id, 'dream-job-done')
  const [dreamJobStatus, setDreamJobStatus] = useState(() => (readStore(doneKey, false) ? 'done' : 'checking'))
  useEffect(() => {
    if (dreamJobStatus !== 'checking') return undefined
    let cancelled = false
    supabase.from('dream_jobs').select('id').eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      if (data) {
        writeStore(doneKey, true)
        setDreamJobStatus('done')
      } else {
        // On a read error, don't block the app behind the prompt. Teachers
        // aren't asked for a target exam.
        setDreamJobStatus(error || mode === 'teacher' ? 'done' : 'ask')
      }
    })
    return () => { cancelled = true }
  }, [dreamJobStatus, user.id, doneKey, mode])

  const route = resolve(path)
  useEffect(() => {
    if (!route) navigate('/', { replace: true, force: true })
  }, [route])

  useEffect(() => {
    document.body.classList.toggle('has-sidebar', !!route?.nav)
    return () => document.body.classList.remove('has-sidebar')
  }, [route?.nav])

  const ctx = useMemo(() => ({
    user,
    theme,
    setTheme,
    lang,
    setLang,
    stats,
    statsState,
    refreshStats,
    counts,
    refreshCounts,
    isAdmin,
    practice,
    setPractice,
    mode,
    hasCourse: !!hasCourse,
    refreshHasCourse,
    practiceAccess,
    practicePass,
    refreshPass,
    openProfile: () => setProfileOpen(true),
  }), [user, theme, setTheme, lang, setLang, stats, statsState, refreshStats, counts, refreshCounts, isAdmin, practice, setPractice, mode, hasCourse, refreshHasCourse, practiceAccess, practicePass, refreshPass])

  if (dreamJobStatus === 'checking') return <div className="boot-splash" aria-busy="true" />
  if (dreamJobStatus === 'ask') {
    return (
      <AppContext.Provider value={ctx}>
        <DreamJobPrompt onDone={() => { writeStore(doneKey, true); setDreamJobStatus('done') }} />
      </AppContext.Provider>
    )
  }
  if (!route) return null

  const { Component, params, nav } = route
  const courseLocked = route.needsCourse && !ctx.hasCourse
  const planLocked = route.needsPlan === 'full' ? practiceAccess !== 'full' : route.needsPlan === 'paid' && !isPaid(practiceAccess)
  // Wait for the course and plan checks before showing a locked section.
  const checking = (courseLocked && hasCourse === null) || (planLocked && practiceAccess === 'checking')
  let screen = <Component params={params} path={path} />
  if (checking) screen = <div className="boot-splash" aria-busy="true" />
  else if (courseLocked) screen = <CourseLock />
  else if (planLocked) screen = <PlanLock path={path} />
  return (
    <AppContext.Provider value={ctx}>
      <Suspense fallback={<div className="boot-splash" aria-busy="true" />}>
        {screen}
      </Suspense>
      {nav && <NavBar />}
      <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
    </AppContext.Provider>
  )
}
