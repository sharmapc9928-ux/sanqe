# Deploy checklist — security fixes + new features (Oct 2026)

Do these **in order**. Steps 1–3 close the live data leak and can be done before the frontend ships; the current live app keeps working after them.

## 1. Apply the database migrations

> ✅ **Done 6 Oct 2026**: all five applied to the live project, plus `20261006132425_question_images_and_admin.sql` (question pictures, `question-images` storage bucket, `app_admins` + admin write access). Files were renamed to the versions the database recorded, so `supabase db push` sees them as applied.

Supabase dashboard → SQL Editor (project `<your-project-ref>`), run each file's contents in this order — or `supabase db push` if you use the CLI:

1. `supabase/migrations/20261006131919_descriptive_per_user_rls.sql` — **fixes the leak**: essays/drafts/evaluations become owner-only; drafts keyed per user
2. `supabase/migrations/20261006131923_move_pg_net_out_of_public.sql` — security advisor fix
3. `supabase/migrations/20261006131928_explanations_and_descriptive_exams.sql` — solution columns, SBI PO letter format
4. `supabase/migrations/20261006132058_practice_questions.sql` — topic list + shared `practice_questions` table for every subject (see `ADDING-QUESTIONS.md`)
5. `supabase/migrations/20261006132103_progress_review_daily.sql` — progress, Mistake Notebook, Daily Challenge, stats

Verify: Database → Advisors → Security shows no new errors, and in the SQL editor
`select policyname from pg_policies where tablename = 'descriptive_submissions';` returns only `own read`, `own insert`.

Note: the 7 existing anonymous submissions have no owner, so after step 1.1 nobody can see them. That's intended.

## 2. Deploy the edge functions

> ✅ **`delete-account` deployed 6 Oct 2026** (version 1, JWT verification on). `evaluate-descriptive` was already live (v9).

```bash
supabase functions deploy evaluate-descriptive --no-verify-jwt   # checks the user itself; also enforces 10 evaluations/user/day
supabase functions deploy delete-account                          # JWT verification ON
```

## 3. Dashboard settings

- Authentication → Providers → Email → enable **Leaked password protection** (if your plan includes it).

## 4. Push the frontend

Commit `sanqe-app/`, `supabase/`, `tools/`, `DEPLOY-CHECKLIST.md`, `ADDING-QUESTIONS.md`, then push — Vercel deploys. `sanqe-app/vercel.json` adds the SPA rewrite so deep links (`/practice/...`) survive a refresh; files with a dot (`/privacy.html`, `/.well-known/assetlinks.json`) are never rewritten.

Check after deploy:
- `https://fedge-sanqe.vercel.app/.well-known/assetlinks.json` returns JSON
- `https://fedge-sanqe.vercel.app/practice` loads the app after a hard refresh
- Log in → Practice → answer a question → Dashboard shows today's count
- Practice → Reasoning shows all sections; a topic with no questions says "Coming soon"
- Focus timer → Start → the timer pill appears in the top bar of other screens

## 5. Play Console — Data safety (required before the next release)

The old declaration ("no data collected") is no longer true. Update **App content → Data safety** to match `public/privacy.html`:

| Data type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Personal info → Name | Yes | No | Account management, App functionality | Required |
| Personal info → Email address | Yes | No | Account management | Required |
| App activity → App interactions (practice answers, scores) | Yes | No | App functionality, Analytics | Required |
| App activity → Other user-generated content (descriptive answers, question reports) | Yes | See note | App functionality | Optional (only if you submit a descriptive test or report a question) |
| App info and performance / Device or other IDs | No | — | — | — |

Note on "Shared": Play doesn't count a service provider processing data on your behalf as sharing. That holds if the Gemini key is on a **paid** tier (Google doesn't use the content for its own purposes). On the **free** tier Google may use submitted content to improve its products — then declare it as shared with Google. Check which tier the `GEMINI_API_KEY` belongs to before answering.

Also: data is encrypted in transit → **Yes**; users can request deletion → **Yes**, with the deletion URL
`https://fedge-sanqe.vercel.app/privacy.html#delete-account`.

## Not done yet (deliberately deferred)

- Practice questions for the new topics: you add them from your books (`ADDING-QUESTIONS.md`).
- Revision notes exist for the five original quant topics only; other topics show "Notes coming soon" in Learn.

- Worked solutions content: generator in `tools/explanations/` (quadratics ready and verified; others pending).
- ~~Question data fix: simplification #79 is missing brackets~~ ✅ fixed 6 Oct 2026 (migration `20261006134620`).
- New descriptive mocks (only IBPS PO Mock 1 exists; SBI PO appears automatically once a `sbi_po` prompt row is added).
