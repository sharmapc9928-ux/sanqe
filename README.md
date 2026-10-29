# Sanqe

Open-source practice platform for Indian bank-exam aspirants (SBI PO/Clerk, IBPS PO/Clerk/RRB, RBI). Built with React, Vite and Supabase.

Live app: <https://fedge-sanqe.vercel.app>

There is very little open tooling for Indian competitive-exam prep. Sanqe's goal is to fill that gap: a complete, forkable stack that a student, a teacher or a small coaching institute can run on a free Supabase project.

## What it does

- **Topic practice** for Prelims and Mains (Quant, Reasoning, English, DI, Computer Awareness) with timed modes, Pomodoro, a mistake notebook with spaced review (1 / 3 / 7 days), and a Speed Score per topic.
- **Daily Challenge**: the same questions for everyone each day, graded on the server, with a leaderboard.
- **Speed drill** for mental maths.
- **Descriptive writing mocks** (essay, letter, comprehension) with AI evaluation that returns inline grammar marks and an improved version.
- **Coaching portal**: small institutes create their own full-length mock series and give students access with access codes. Mocks are private to the institute's enrolled students, scored on the server, with sectional timers and negative marking.
- Installable PWA, server-rendered public pages for SEO.

Answers are always graded in the database, never trusted from the client. Personal data is owner-only through row-level security.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 5, `vite-plugin-pwa`, KaTeX |
| Backend | Supabase (Postgres + RLS, Auth, Storage, Edge Functions) |
| Payments | Razorpay (edge functions, optional) |
| Hosting | Vercel (static app plus `api/` for server-rendered public pages) |

## Repository layout

```
sanqe-app/            the web app
  src/                screens, components, lib (API, router, timers, syllabus)
  api/                server-rendered public pages + sitemap (Vercel functions)
supabase/
  migrations/         schema, RLS policies, RPCs, paywall and abuse limits
  functions/          edge functions (payments, AI evaluation, account deletion)
  rollbacks/          rollback scripts for the larger migrations
ADDING-QUESTIONS.md   how to load your own questions
DEPLOY-CHECKLIST.md   order in which to apply migrations and deploy
```

## Run it locally

You need Node 18+ and a Supabase project (the free plan is enough).

```bash
cd sanqe-app
cp .env.example .env.local     # add your Supabase URL and anon/publishable key
npm install
npm run dev                    # http://localhost:5173
```

Apply the SQL files in `supabase/migrations/` to your project in filename order (SQL editor or `supabase db push`). `DEPLOY-CHECKLIST.md` has the details.

Edge functions read their secrets from the Supabase dashboard (`GEMINI_API_KEY` for descriptive evaluation, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` for payments). Nothing secret lives in this repository.

## What is not in this repository

The hosted Fedge Sanqe service's question bank, its full-length mock content and its store listing assets are not included. The app ships with the mechanism for loading questions (`ADDING-QUESTIONS.md`, `supabase/practice_questions_template.csv`) so you can bring your own. After applying the migrations, add yourself as an admin (see `supabase/migrations/20261006132425_question_images_and_admin.sql`, which uses a placeholder email) to use the admin and coach screens.

## Contributing

Issues and pull requests are welcome, especially for new exam patterns, more topics, accessibility, and translations (Hindi first).

## License

[MIT](LICENSE)
