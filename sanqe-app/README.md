# Fedge Sanqe — Bank Exam Practice

React 18 + Vite 5 + Supabase app for SBI PO/Clerk, IBPS PO/Clerk/RRB and RBI aspirants. Live at https://fedge-sanqe.vercel.app (installable PWA, also packaged for Play as a TWA).

## Features

| Area | Route | What it does |
|---|---|---|
| Dashboard | `/` | Streak, daily goal, mistakes due, Daily Challenge, Speed Score for topics you've practised, subjects, focus timer |
| Practice | `/practice` → `/practice/:subject` → `/practice/:subject/:topic` | A Prelims tab (Quant, Reasoning, English; GA is hidden for now) and a Mains tab (DI & Quant, Reasoning, Computer Awareness, English), each split into sections and topics covering the PO/Clerk/RRB syllabus. 15/30/60 min, Intense, Pomodoro and 52/17 modes |
| Focus timer | `/focus` | Pomodoro (25/5, long break every 4 rounds) and 52/17; runs across the app, survives sleep/reload, alerts when a phase ends |
| Results | `/practice/:subject/:topic/results` | Accuracy donut, pace vs target, break countdown after a focus block, per-question review with solutions |
| Mistake Notebook | `/review` | Every wrong answer, spaced review at 1 → 3 → 7 days; 3 correct reviews clears it |
| Daily Challenge | `/daily` | Same 15 questions for everyone each day (IST), 10 min, graded on the server, leaderboard |
| Circle Game | `/speed` | 60-second mental-addition drill, personal best on device |
| Learn | `/learn/:subject/:topic` | Revision notes in the same subject → section → topic layout |
| Descriptive mocks | `/mocks/...` | IBPS PO (Essay + Comprehension) and SBI PO (Letter + Essay), exam-style UI, autosave + resume, AI evaluation with inline grammar marks and an improved version |

Login is required (email/password or Google). Every screen has a real URL, so the Android back button and refresh behave correctly.

## Code layout

```
src/
  App.jsx              auth gate, routes, app context (theme, language, stats, practice run)
  lib/                 router, api (Supabase calls), syllabus (subjects → sections → topics), focus timer,
                       descriptive API, timers, storage, Speed Score
  components/          Layout (nav, page shell, profile panel), ui (modal, charts, skeletons), Solution, DescriptiveResult
  screens/             one file per screen
  content/learn.js     Learn sheets (tables are generated in code)
supabase/
  migrations/          schema, RLS, progress tables, daily challenge, multi-exam descriptive
  functions/           evaluate-descriptive (Gemini scoring), delete-account
tools/explanations/    generator for worked solutions (work in progress — see its README)
```

## Database

Supabase project **SANQe** (`<your-project-ref>`, ap-south-1 Mumbai).

- Question tables (`simplification`, `approximation`, `number_series`, `wrong_number_series`, `quadratic_equations`) and the shared `practice_questions` table (every other topic, keyed by `topic`): public read; optional `explanation` / `explanation_hi` columns hold worked solutions. How to add questions: `../ADDING-QUESTIONS.md`.
- Everything personal (`dream_jobs`, `question_attempts`, `practice_sessions`, `review_queue`, `daily_challenge_results`, `descriptive_*`) is owner-only via RLS and is deleted with the account (`ON DELETE CASCADE`).
- Answers are graded in the database (trigger / RPC), never trusted from the client.

The app tolerates a database where the newer migrations aren't applied yet: those features hide themselves instead of erroring. See `../DEPLOY-CHECKLIST.md` for the rollout order.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

Add practice questions as described in `../ADDING-QUESTIONS.md`; new descriptive mocks are rows in `descriptive_prompts` (`exam` = `ibps_po` or `sbi_po`).
