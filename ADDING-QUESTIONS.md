# Adding practice questions

Every topic in the app (Quant, Reasoning, English, GA in Prelims; Computer Awareness in Mains only) is already a section with its own page. A topic shows **“Coming soon”** until it has questions; as soon as you add them, they appear in Practice — no code change or redeploy needed.

## Where questions go

- **Simplification, Approximation, Number Series, Wrong Number Series, Quadratic Equations** keep their existing tables (same as before).
- **Every other topic** uses one shared table: `practice_questions`.

The table is created by `supabase/migrations/20261006132058_practice_questions.sql` (see `DEPLOY-CHECKLIST.md`).

## Adding questions in the app (easiest)

Log in with an admin account → profile icon → **Question admin** (or open `/admin`). Pick the topic, fill the form, tap the letter of the correct option, **Save** (Ctrl + Enter). The preview on the right shows exactly how the question will look.

- **Pictures** (DI charts, diagrams): *Choose a picture*, or paste a screenshot with Ctrl + V. Big phone photos are shrunk automatically.
- **Question sets**: after Save, the passage, picture and source stay filled, so the next question of the same DI / puzzle / RC set only needs its own question and options.
- **Fix a typo**: the list under the form has Edit and Delete for every question in the topic (search by text or `#id` once a topic has more than 10).
- **All 60 topics** work here, including the five original quant topics (those take five options and no passage / picture).

### Many questions at once: Bulk import tab

1. **Template** downloads a CSV with the right header row and an example.
2. Fill it in Excel / Google Sheets: one question per row. `topic` can be the key (`percentage`) or the name (`Ratio & Proportion`); leave it empty to use the topic picked on the screen. `correct_option` can be `A`–`E`, `(b)` or `1`–`5`.
3. Choose the saved CSV, **or** select the cells in the sheet (header row included), copy, and paste into the box.
4. **Check rows** lists every problem with its sheet row number (*Row 7: option C empty*) and skips questions that are already on the database.
5. **Import** saves the good rows. Fix the error rows in the sheet and import the same file again: rows already imported are skipped as duplicates.

### Reports tab

Students can tap **Report** under any question (after answering, in results, the Mistake Notebook and the Daily Challenge review) and pick a reason: wrong answer key, typo, unclear, picture problem, other. Reports appear here grouped by question with the number of reports and the students' notes. **Edit question** opens it in the Add / Edit tab; **Mark fixed** closes the reports. The red number on the tab is the count of open reports.

Admins are rows in `public.app_admins`. To add one (Supabase → SQL Editor):

```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'their-email@example.com';
```

## Writing maths

Put maths between dollar signs and it is drawn like a book (works in the question, passage, options and solutions):

| You type | Shows as |
|---|---|
| `$\frac{3}{4}$` | three-quarters as a stacked fraction |
| `$x^2$`, `$2^{10}$` | powers |
| `$\sqrt{196}$`, `$\sqrt[3]{27}$` | square / cube root |
| `$12 \times 5 \div 3$` | × and ÷ |
| `$12\frac{1}{2}\%$` | 12½% (a % inside maths needs `\%`) |

Text without dollar signs shows exactly as typed, so the old questions (written with ² ³ √) are unaffected. For a real dollar sign write `\$`.

## Adding one question (Table Editor)

Supabase → Table Editor → `practice_questions` → **Insert row**:

| Column | What to put |
|---|---|
| `topic` | Pick from the dropdown (list below) |
| `passage` | *Optional.* Text shown above the question — puzzle clues, DI table, RC passage. Repeat the same passage on each question of a set. |
| `image_url` | *Optional.* Public URL of a picture (chart, diagram) shown above the question. Easiest to set from the admin screen, which uploads to the `question-images` bucket. |
| `question` | The question itself |
| `option_a` … `option_d` | The options |
| `option_e` | Fifth option; leave empty for 4-option questions |
| `correct_option` | `a`, `b`, `c`, `d` or `e` |
| `explanation` | *Optional.* Solution in English (line breaks are kept) |
| `explanation_hi` | *Optional.* Solution in Hinglish |
| `source` | *Optional.* For yourself, e.g. "Arihant p. 132" — not shown in the app |

## Adding many at once (CSV, Supabase dashboard)

The **Bulk import** tab in the app is easier and checks every row first. The dashboard route still works:

1. Fill `supabase/practice_questions_template.csv` in Excel / Google Sheets — one question per row, same column names.
2. Table Editor → `practice_questions` → **Insert → Import data from CSV**.
3. Leave `id` and `created_at` out; the database fills them.

Answers are graded on the server from `correct_option`, so the score, streak, Speed Score and Mistake Notebook all work for these topics automatically.

## Topic keys

### Quantitative Aptitude

| Section | Topic | topic key |
|---|---|---|
| Speed Maths | Simplification | `simplification` *(own table: simplification)* |
| Speed Maths | Approximation | `approximation` *(own table: approximation)* |
| Speed Maths | Tables, Squares & Cubes | `speed_calc` |
| Speed Maths | Circle Game | — (own screen) |
| Arithmetic | Ratio & Proportion | `ratio_proportion` |
| Arithmetic | Percentage | `percentage` |
| Arithmetic | Average | `average` |
| Arithmetic | Problems on Ages | `ages` |
| Arithmetic | Profit, Loss & Discount | `profit_loss` |
| Arithmetic | Simple Interest | `simple_interest` |
| Arithmetic | Compound Interest | `compound_interest` |
| Arithmetic | Partnership | `partnership` |
| Arithmetic | Mixture & Alligation | `mixture_alligation` |
| Arithmetic | Time & Work | `time_work` |
| Arithmetic | Pipes & Cisterns | `pipes_cisterns` |
| Arithmetic | Time, Speed & Distance | `speed_distance` |
| Arithmetic | Problems on Trains | `trains` |
| Arithmetic | Boats & Streams | `boats_streams` |
| Number Series & Equations | Number Series | `number_series` *(own table: number_series)* |
| Number Series & Equations | Wrong Number Series | `wrong_number_series` *(own table: wrong_number_series)* |
| Number Series & Equations | Quadratic Equations | `quadratic_equations` *(own table: quadratic_equations)* |
| Advanced Maths | Mensuration | `mensuration` |
| Advanced Maths | Probability | `probability` |
| Advanced Maths | Permutation & Combination | `permutation_combination` |
| Advanced Maths | Quantity Comparison | `quantity_comparison` |
| Data Interpretation | Table DI | `di_table` |
| Data Interpretation | Pie & Bar Chart DI | `di_charts` |
| Data Interpretation | Caselet & Data Sufficiency | `caselet_ds` |

### Reasoning Ability

| Section | Topic | topic key |
|---|---|---|
| Puzzles & Seating | Linear Seating | `seating_linear` |
| Puzzles & Seating | Circular Seating | `seating_circular` |
| Puzzles & Seating | Floor Puzzles | `floor_puzzle` |
| Puzzles & Seating | Box, Month & Day Puzzles | `box_scheduling` |
| Logic | Inequality | `inequality` |
| Logic | Syllogism | `syllogism` |
| Logic | Data Sufficiency | `reasoning_ds` |
| Verbal & Coded | Coding–Decoding | `coding_decoding` |
| Verbal & Coded | Blood Relations | `blood_relations` |
| Verbal & Coded | Direction Sense | `direction_sense` |
| Verbal & Coded | Order & Ranking | `order_ranking` |
| Verbal & Coded | Alphabet & Alphanumeric Series | `alphanumeric_series` |
| Verbal & Coded | Input–Output | `input_output` |
| Critical Reasoning | Statements & Conclusions | `logical_reasoning` |

### English Language

| Section | Topic | topic key |
|---|---|---|
| Grammar | Error Spotting | `error_spotting` |
| Grammar | Phrase Replacement | `sentence_improvement` |
| Grammar | Fillers | `fillers` |
| Vocabulary | Synonyms & Antonyms | `vocabulary` |
| Vocabulary | Idioms & Phrases | `idioms` |
| Reading | Reading Comprehension | `reading_comprehension` |
| Reading | Cloze Test | `cloze_test` |
| Reading | Para Jumbles | `para_jumbles` |
| Descriptive (Mains) | Essay & Letter Writing | — (own screen) |

### General & Banking Awareness

| Section | Topic | topic key |
|---|---|---|
| Banking Awareness | RBI & Monetary Policy | `rbi_monetary` |
| Banking Awareness | Indian Banking: History & Structure | `banking_history` |
| Banking Awareness | Banking Terms & Products | `banking_terms` |
| Banking Awareness | Regulators & Financial Institutions | `financial_institutions` |
| Economy & Schemes | Indian Economy Basics | `economy_basics` |
| Economy & Schemes | Government Schemes | `govt_schemes` |
| Static GK & Current Affairs | Static GK | `static_gk` |
| Static GK & Current Affairs | Current Affairs Strategy | `current_affairs` |

### Computer Awareness (Mains only)

Computer is not part of the Prelims syllabus, so these topics show under the **Mains** tab in Practice. They keep these original keys (no `m_` prefix).

| Section | Topic | topic key |
|---|---|---|
| Fundamentals | Computer Fundamentals | `computer_fundamentals` |
| Fundamentals | Hardware & Memory | `hardware_memory` |
| Fundamentals | Number System | `number_system` |
| Software & Networks | Software & Operating Systems | `software_os` |
| Software & Networks | MS Office & Shortcuts | `ms_office` |
| Software & Networks | Networking & Internet | `networking_internet` |
| Software & Networks | Database (DBMS) | `dbms` |
| Software & Networks | Cyber Security | `cyber_security` |

## Adding a brand-new topic

1. Add it to `sanqe-app/src/lib/syllabus.js` in the right subject and section (key, name, icon, `practice: 'quiz'`, `targetSec`, description).
2. Insert a row into `practice_topics` with the same `key`, its `subject` and `name`, so it appears in the `topic` dropdown.
