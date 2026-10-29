import {
  ArrowLeftRight, BarChart3, BookA, Boxes, Brain, Building2, Calculator, CircleDot, Coins, Compass, Cpu, Database,
  Dices, Divide, Droplets, FileSpreadsheet, FlaskConical, Globe, Handshake, HardDrive, Hourglass, KeyRound, Landmark,
  Layers, ListOrdered, MessageSquareQuote, Monitor, Network, Newspaper, PenLine, Percent, PieChart, PiggyBank,
  Repeat, Ruler, Sailboat, Scale, ScrollText, SearchX, ShieldCheck, Shuffle, Sigma, SpellCheck, Superscript, Table2,
  TextCursorInput, TrainFront, Users, UsersRound, Waves, Binary, Armchair, Banknote, Gauge, Library, Replace, Wrench,
} from 'lucide-react'

// The whole Prelims + Mains syllabus for SBI / IBPS PO, Clerk and RRB,
// subject → section → topic.
//
// practice:
//   'quiz' — practised in the quiz screen. Questions come from the topic's
//            own table (`table`, the five original quant tables) or from
//            the shared `practice_questions` table filtered by topic key.
//   'link' — practised on its own screen (`to`)
// targetSec: exam-ready time per question, used by the Speed Score.

const SUBJECT_LIST = [
  {
    key: 'quant',
    name: 'Quantitative Aptitude',
    short: 'Quant',
    Icon: Calculator,
    hue: 'blue',
    desc: 'Speed maths, arithmetic and data interpretation',
    groups: [
      {
        title: 'Speed Maths',
        topics: [
          { key: 'simplification', name: 'Simplification', Icon: Divide, practice: 'quiz', table: 'simplification', targetSec: 25, desc: 'BODMAS, percentages, squares & roots' },
          { key: 'approximation', name: 'Approximation', Icon: Waves, practice: 'quiz', table: 'approximation', targetSec: 20, desc: 'Round off & estimate the value' },
          { key: 'speed_calc', name: 'Tables, Squares & Cubes', short: 'Tables & Squares', Icon: Sigma, practice: 'quiz', targetSec: 8, desc: 'Products, squares, cubes, roots and quick percentages' },
          { key: 'circle_game', name: 'Circle Game', Icon: CircleDot, practice: 'link', to: '/speed', desc: '60-second mental addition drill' },
        ],
      },
      {
        title: 'Arithmetic',
        topics: [
          { key: 'ratio_proportion', name: 'Ratio & Proportion', short: 'Ratio', Icon: Scale, practice: 'quiz', targetSec: 40, desc: 'Sharing, compound ratios, proportionals' },
          { key: 'percentage', name: 'Percentage', Icon: Percent, practice: 'quiz', targetSec: 35, desc: 'Increase, decrease, successive change' },
          { key: 'average', name: 'Average', Icon: Gauge, practice: 'quiz', targetSec: 35, desc: 'Adding or removing members, consecutive numbers' },
          { key: 'ages', name: 'Problems on Ages', short: 'Ages', Icon: Hourglass, practice: 'quiz', targetSec: 45, desc: 'Present, past and future age ratios' },
          { key: 'profit_loss', name: 'Profit, Loss & Discount', short: 'Profit & Loss', Icon: Banknote, practice: 'quiz', targetSec: 45, desc: 'Cost price, marked price, discounts' },
          { key: 'simple_interest', name: 'Simple Interest', short: 'Simple Interest', Icon: PiggyBank, practice: 'quiz', targetSec: 35, desc: 'Interest, rate, time and amount' },
          { key: 'compound_interest', name: 'Compound Interest', short: 'Compound Interest', Icon: Coins, practice: 'quiz', targetSec: 45, desc: 'Annual and half-yearly compounding, CI − SI' },
          { key: 'partnership', name: 'Partnership', Icon: Handshake, practice: 'quiz', targetSec: 45, desc: 'Profit shares by capital and time' },
          { key: 'mixture_alligation', name: 'Mixture & Alligation', short: 'Mixtures', Icon: FlaskConical, practice: 'quiz', targetSec: 50, desc: 'Mixing prices, milk–water, replacement' },
          { key: 'time_work', name: 'Time & Work', Icon: Wrench, practice: 'quiz', targetSec: 50, desc: 'Working together, efficiency, leaving midway' },
          { key: 'pipes_cisterns', name: 'Pipes & Cisterns', short: 'Pipes', Icon: Droplets, practice: 'quiz', targetSec: 50, desc: 'Filling, emptying and leaks' },
          { key: 'speed_distance', name: 'Time, Speed & Distance', short: 'Speed & Distance', Icon: Compass, practice: 'quiz', targetSec: 45, desc: 'Average speed, relative speed, late & early' },
          { key: 'trains', name: 'Problems on Trains', short: 'Trains', Icon: TrainFront, practice: 'quiz', targetSec: 45, desc: 'Crossing poles, platforms and other trains' },
          { key: 'boats_streams', name: 'Boats & Streams', short: 'Boats', Icon: Sailboat, practice: 'quiz', targetSec: 45, desc: 'Upstream, downstream and still water' },
        ],
      },
      {
        title: 'Number Series & Equations',
        topics: [
          { key: 'number_series', name: 'Number Series', Icon: ListOrdered, practice: 'quiz', table: 'number_series', targetSec: 30, desc: 'Find the missing number' },
          { key: 'wrong_number_series', name: 'Wrong Number Series', short: 'Wrong Series', Icon: SearchX, practice: 'quiz', table: 'wrong_number_series', targetSec: 30, desc: 'Spot the odd term in the series' },
          { key: 'quadratic_equations', name: 'Quadratic Equations', short: 'Quadratics', Icon: Superscript, practice: 'quiz', table: 'quadratic_equations', targetSec: 30, desc: 'Compare the roots of x and y' },
        ],
      },
      {
        title: 'Advanced Maths',
        topics: [
          { key: 'mensuration', name: 'Mensuration', Icon: Ruler, practice: 'quiz', targetSec: 50, desc: 'Area, perimeter, volume and surface area' },
          { key: 'probability', name: 'Probability', Icon: Dices, practice: 'quiz', targetSec: 50, desc: 'Dice, coins, cards and balls' },
          { key: 'permutation_combination', name: 'Permutation & Combination', short: 'P & C', Icon: Shuffle, practice: 'quiz', targetSec: 50, desc: 'Arrangements and selections' },
          { key: 'quantity_comparison', name: 'Quantity Comparison', Icon: ArrowLeftRight, practice: 'quiz', targetSec: 40, desc: 'Compare Quantity I and Quantity II' },
        ],
      },
      {
        title: 'Data Interpretation',
        topics: [
          { key: 'di_table', name: 'Table DI', Icon: Table2, practice: 'quiz', targetSec: 60, desc: 'Ratios, growth and averages from a table' },
          { key: 'di_charts', name: 'Pie & Bar Chart DI', short: 'Chart DI', Icon: PieChart, practice: 'quiz', targetSec: 60, desc: 'Read percentages, angles and bars quickly' },
          { key: 'caselet_ds', name: 'Caselet & Data Sufficiency', short: 'Caselet & DS', Icon: FileSpreadsheet, practice: 'quiz', targetSec: 60, desc: 'Turn a paragraph into a table; is the data enough?' },
        ],
      },
    ],
  },
  {
    key: 'reasoning',
    name: 'Reasoning Ability',
    short: 'Reasoning',
    Icon: Brain,
    hue: 'violet',
    desc: 'Puzzles, seating, inequality, syllogism and more',
    groups: [
      {
        title: 'Puzzles & Seating',
        topics: [
          { key: 'seating_linear', name: 'Linear Seating', Icon: Armchair, practice: 'quiz', targetSec: 150, desc: 'People in a row facing north' },
          { key: 'seating_circular', name: 'Circular Seating', Icon: CircleDot, practice: 'quiz', targetSec: 150, desc: 'People around a table facing the centre' },
          { key: 'floor_puzzle', name: 'Floor Puzzles', Icon: Building2, practice: 'quiz', targetSec: 150, desc: 'Who lives on which floor' },
          { key: 'box_scheduling', name: 'Box, Month & Day Puzzles', short: 'Box & Scheduling', Icon: Boxes, practice: 'quiz', targetSec: 150, desc: 'Stacked boxes and schedules' },
        ],
      },
      {
        title: 'Logic',
        topics: [
          { key: 'inequality', name: 'Inequality', Icon: ArrowLeftRight, practice: 'quiz', targetSec: 30, desc: 'Which conclusions definitely follow' },
          { key: 'syllogism', name: 'Syllogism', Icon: Layers, practice: 'quiz', targetSec: 45, desc: 'All, some, no — with Venn diagrams' },
          { key: 'reasoning_ds', name: 'Data Sufficiency', Icon: FileSpreadsheet, practice: 'quiz', targetSec: 45, desc: 'Decide which statements are enough' },
        ],
      },
      {
        title: 'Verbal & Coded',
        topics: [
          { key: 'coding_decoding', name: 'Coding–Decoding', Icon: KeyRound, practice: 'quiz', targetSec: 40, desc: 'Letter shifts, reversals and number codes' },
          { key: 'blood_relations', name: 'Blood Relations', Icon: Users, practice: 'quiz', targetSec: 40, desc: 'Family trees from statements' },
          { key: 'direction_sense', name: 'Direction Sense', Icon: Compass, practice: 'quiz', targetSec: 45, desc: 'Distance and direction from the start' },
          { key: 'order_ranking', name: 'Order & Ranking', Icon: ListOrdered, practice: 'quiz', targetSec: 30, desc: 'Positions from the left, right, top and bottom' },
          { key: 'alphanumeric_series', name: 'Alphabet & Alphanumeric Series', short: 'Alphanumeric', Icon: TextCursorInput, practice: 'quiz', targetSec: 40, desc: 'Letter positions and element counting' },
          { key: 'input_output', name: 'Input–Output', Icon: Repeat, practice: 'quiz', targetSec: 60, desc: 'Find the machine’s rearrangement rule' },
        ],
      },
      {
        title: 'Critical Reasoning',
        topics: [
          { key: 'logical_reasoning', name: 'Statements & Conclusions', short: 'Critical Reasoning', Icon: ScrollText, practice: 'quiz', targetSec: 45, desc: 'Assumptions, arguments, courses of action' },
        ],
      },
    ],
  },
  {
    key: 'english',
    name: 'English Language',
    short: 'English',
    Icon: BookA,
    hue: 'teal',
    desc: 'Grammar, vocabulary and reading comprehension',
    groups: [
      {
        title: 'Grammar',
        topics: [
          { key: 'error_spotting', name: 'Error Spotting', Icon: SpellCheck, practice: 'quiz', targetSec: 30, desc: 'Find the part with the grammatical error' },
          { key: 'sentence_improvement', name: 'Phrase Replacement', Icon: Replace, practice: 'quiz', targetSec: 35, desc: 'Replace the bold part with the correct phrase' },
          { key: 'fillers', name: 'Fillers', Icon: PenLine, practice: 'quiz', targetSec: 25, desc: 'Choose the word that fits the blank' },
        ],
      },
      {
        title: 'Vocabulary',
        topics: [
          { key: 'vocabulary', name: 'Synonyms & Antonyms', short: 'Vocabulary', Icon: Library, practice: 'quiz', targetSec: 15, desc: 'Word meanings used in bank exams' },
          { key: 'idioms', name: 'Idioms & Phrases', short: 'Idioms', Icon: MessageSquareQuote, practice: 'quiz', targetSec: 15, desc: 'Meaning of common idioms' },
        ],
      },
      {
        title: 'Reading',
        topics: [
          { key: 'reading_comprehension', name: 'Reading Comprehension', short: 'RC', Icon: Newspaper, practice: 'quiz', targetSec: 40, desc: 'How to read fast and answer accurately' },
          { key: 'cloze_test', name: 'Cloze Test', Icon: TextCursorInput, practice: 'quiz', targetSec: 25, desc: 'Fill a passage with the right words' },
          { key: 'para_jumbles', name: 'Para Jumbles', Icon: Shuffle, practice: 'quiz', targetSec: 45, desc: 'Arrange sentences into a paragraph' },
        ],
      },
    ],
  },
  {
    key: 'ga',
    hidden: true,
    name: 'General & Banking Awareness',
    short: 'GA',
    Icon: Landmark,
    hue: 'amber',
    desc: 'RBI, banking, financial institutions, schemes and static GK',
    groups: [
      {
        title: 'Banking Awareness',
        topics: [
          { key: 'rbi_monetary', name: 'RBI & Monetary Policy', short: 'RBI', Icon: Landmark, practice: 'quiz', targetSec: 15, desc: 'Functions, policy tools, MPC' },
          { key: 'banking_history', name: 'Indian Banking: History & Structure', short: 'Banking History', Icon: Building2, practice: 'quiz', targetSec: 15, desc: 'Nationalisation, types of banks, committees' },
          { key: 'banking_terms', name: 'Banking Terms & Products', short: 'Banking Terms', Icon: Banknote, practice: 'quiz', targetSec: 15, desc: 'NPA, KYC, NEFT/RTGS, cheques, accounts' },
          { key: 'financial_institutions', name: 'Regulators & Financial Institutions', short: 'Regulators', Icon: Scale, practice: 'quiz', targetSec: 15, desc: 'SEBI, IRDAI, NABARD, SIDBI and more' },
        ],
      },
      {
        title: 'Economy & Schemes',
        topics: [
          { key: 'economy_basics', name: 'Indian Economy Basics', short: 'Economy', Icon: BarChart3, practice: 'quiz', targetSec: 15, desc: 'GDP, inflation, deficits, budget terms' },
          { key: 'govt_schemes', name: 'Government Schemes', short: 'Schemes', Icon: UsersRound, practice: 'quiz', targetSec: 15, desc: 'Financial inclusion and social security' },
        ],
      },
      {
        title: 'Static GK & Current Affairs',
        topics: [
          { key: 'static_gk', name: 'Static GK', Icon: Globe, practice: 'quiz', targetSec: 12, desc: 'International organisations and headquarters' },
          { key: 'current_affairs', name: 'Current Affairs Strategy', short: 'Current Affairs', Icon: Newspaper, practice: 'quiz', targetSec: 12, desc: 'What to cover in the last 6 months' },
        ],
      },
    ],
  },
]

// Mains-level practice. Same shape as the Prelims list above; questions live in
// the shared `practice_questions` table under these topic keys (all start with
// `m_`, so they never clash with a Prelims topic). Add a topic here and as a row
// in `practice_topics` (see supabase/migrations/*_mains_practice_topics.sql).
// Computer Awareness is the exception: it is not a Prelims subject, so its
// topics keep their original keys (and the `computer` subject key).
const MAINS_SUBJECT_LIST = [
  {
    key: 'mains_quant',
    name: 'Data Analysis & Interpretation',
    short: 'DI & Quant',
    Icon: BarChart3,
    hue: 'blue',
    desc: 'Mains-level data interpretation, data sufficiency and arithmetic',
    groups: [
      {
        title: 'Data Interpretation',
        topics: [
          { key: 'm_di_table', name: 'Table DI', Icon: Table2, practice: 'quiz', targetSec: 90, desc: 'Multi-step ratios, growth and averages from a table' },
          { key: 'm_di_graph', name: 'Bar & Line Graph DI', short: 'Graph DI', Icon: BarChart3, practice: 'quiz', targetSec: 90, desc: 'Combined bar and line graphs, trends and differences' },
          { key: 'm_di_pie', name: 'Pie & Radar Chart DI', short: 'Pie & Radar DI', Icon: PieChart, practice: 'quiz', targetSec: 90, desc: 'Percentages, angles and two-chart sets' },
          { key: 'm_di_caselet', name: 'Caselet DI', Icon: FileSpreadsheet, practice: 'quiz', targetSec: 100, desc: 'Build the data from a paragraph, then answer' },
        ],
      },
      {
        title: 'Quantitative Aptitude',
        topics: [
          { key: 'm_quant_ds', name: 'Data Sufficiency', Icon: FileSpreadsheet, practice: 'quiz', targetSec: 60, desc: 'Is the data in the statements enough?' },
          { key: 'm_quantity_comparison', name: 'Quantity Comparison', Icon: ArrowLeftRight, practice: 'quiz', targetSec: 45, desc: 'Compare Quantity I and Quantity II' },
          { key: 'm_arithmetic', name: 'Arithmetic Word Problems', short: 'Arithmetic', Icon: Calculator, practice: 'quiz', targetSec: 75, desc: 'Time, work, speed, interest and mixture at Mains level' },
          { key: 'm_number_series', name: 'Number Series', Icon: ListOrdered, practice: 'quiz', targetSec: 40, desc: 'Missing and wrong terms, harder patterns' },
        ],
      },
    ],
  },
  {
    key: 'mains_reasoning',
    name: 'Reasoning Ability',
    short: 'Reasoning',
    Icon: Brain,
    hue: 'violet',
    desc: 'High-level puzzles, seating and logic',
    groups: [
      {
        title: 'Puzzles & Seating',
        topics: [
          { key: 'm_seating', name: 'Seating Arrangement', short: 'Seating', Icon: Armchair, practice: 'quiz', targetSec: 200, desc: 'Linear, circular and square seating with many variables' },
          { key: 'm_puzzles', name: 'Floor, Box & Scheduling Puzzles', short: 'Puzzles', Icon: Building2, practice: 'quiz', targetSec: 200, desc: 'Multi-variable puzzles with conditional clues' },
          { key: 'm_blood_relations', name: 'Blood Relations', Icon: Users, practice: 'quiz', targetSec: 75, desc: 'Family-tree puzzles and coded relations' },
        ],
      },
      {
        title: 'Logic',
        topics: [
          { key: 'm_syllogism', name: 'Syllogism', Icon: Layers, practice: 'quiz', targetSec: 60, desc: 'Possibility cases, either/or and reverse syllogism' },
          { key: 'm_inequality', name: 'Inequality', Icon: ArrowLeftRight, practice: 'quiz', targetSec: 40, desc: 'Coded inequality and direct conclusions' },
          { key: 'm_reasoning_ds', name: 'Data Sufficiency', Icon: FileSpreadsheet, practice: 'quiz', targetSec: 60, desc: 'Decide which statements are enough' },
          { key: 'm_critical', name: 'Critical Reasoning', Icon: ScrollText, practice: 'quiz', targetSec: 60, desc: 'Strengthen, weaken, assumption and inference' },
        ],
      },
      {
        title: 'Verbal & Coded',
        topics: [
          { key: 'm_input_output', name: 'Input–Output', Icon: Repeat, practice: 'quiz', targetSec: 120, desc: 'Rule-based rearrangement and step finding' },
          { key: 'm_coding_decoding', name: 'Coding–Decoding', Icon: KeyRound, practice: 'quiz', targetSec: 50, desc: 'Mixed and conditional codes' },
        ],
      },
    ],
  },
  {
    key: 'computer',
    name: 'Computer Awareness',
    short: 'Computer',
    Icon: Monitor,
    hue: 'rose',
    desc: 'Fundamentals, hardware, software, networks and security',
    groups: [
      {
        title: 'Fundamentals',
        topics: [
          { key: 'computer_fundamentals', name: 'Computer Fundamentals', short: 'Fundamentals', Icon: Cpu, practice: 'quiz', targetSec: 12, desc: 'History, generations, types of computers' },
          { key: 'hardware_memory', name: 'Hardware & Memory', short: 'Hardware', Icon: HardDrive, practice: 'quiz', targetSec: 12, desc: 'Input/output devices, RAM, ROM, storage' },
          { key: 'number_system', name: 'Number System', Icon: Binary, practice: 'quiz', targetSec: 30, desc: 'Binary, octal, decimal and hexadecimal' },
        ],
      },
      {
        title: 'Software & Networks',
        topics: [
          { key: 'software_os', name: 'Software & Operating Systems', short: 'Software & OS', Icon: Layers, practice: 'quiz', targetSec: 12, desc: 'System vs application software, OS basics' },
          { key: 'ms_office', name: 'MS Office & Shortcuts', short: 'MS Office', Icon: FileSpreadsheet, practice: 'quiz', targetSec: 12, desc: 'Word, Excel, PowerPoint and keyboard shortcuts' },
          { key: 'networking_internet', name: 'Networking & Internet', short: 'Networking', Icon: Network, practice: 'quiz', targetSec: 12, desc: 'LAN/WAN, protocols, IP, email, web' },
          { key: 'dbms', name: 'Database (DBMS)', short: 'DBMS', Icon: Database, practice: 'quiz', targetSec: 12, desc: 'Tables, keys, SQL basics' },
          { key: 'cyber_security', name: 'Cyber Security', short: 'Security', Icon: ShieldCheck, practice: 'quiz', targetSec: 12, desc: 'Malware, phishing, firewalls, encryption' },
        ],
      },
    ],
  },
  {
    key: 'mains_english',
    name: 'English Language',
    short: 'English',
    Icon: BookA,
    hue: 'teal',
    desc: 'Reading, grammar and the descriptive paper at Mains level',
    groups: [
      {
        title: 'Reading',
        topics: [
          { key: 'm_rc', name: 'Reading Comprehension', short: 'RC', Icon: Newspaper, practice: 'quiz', targetSec: 60, desc: 'Long passages with inference and vocabulary questions' },
          { key: 'm_cloze', name: 'Cloze Test', Icon: TextCursorInput, practice: 'quiz', targetSec: 30, desc: 'Fill a passage with the right words' },
          { key: 'm_para_jumbles', name: 'Para Jumbles', Icon: Shuffle, practice: 'quiz', targetSec: 60, desc: 'Rearrange sentences, with fixed and odd-one-out sentences' },
        ],
      },
      {
        title: 'Grammar',
        topics: [
          { key: 'm_error_spotting', name: 'Error Spotting', Icon: SpellCheck, practice: 'quiz', targetSec: 35, desc: 'Find the part with the grammatical error' },
          { key: 'm_fillers', name: 'Fillers', Icon: PenLine, practice: 'quiz', targetSec: 30, desc: 'Single and double blanks' },
          { key: 'm_phrase_replacement', name: 'Phrase Replacement', Icon: Replace, practice: 'quiz', targetSec: 40, desc: 'Replace the bold part with the correct phrase' },
        ],
      },
      {
        title: 'Descriptive Paper',
        topics: [
          { key: 'descriptive_writing', name: 'Essay & Letter Writing', short: 'Descriptive', Icon: PenLine, practice: 'link', to: '/mocks', desc: 'Timed mocks with AI evaluation' },
        ],
      },
    ],
  },
  {
    key: 'mains_ga',
    hidden: true,
    name: 'General / Economy / Banking Awareness',
    short: 'GA',
    Icon: Landmark,
    hue: 'amber',
    desc: 'Banking, economy, financial awareness and current affairs',
    groups: [
      {
        title: 'Banking & Finance',
        topics: [
          { key: 'm_banking', name: 'Banking Awareness', Icon: Landmark, practice: 'quiz', targetSec: 15, desc: 'RBI, banks, products, committees and regulations' },
          { key: 'm_financial', name: 'Financial Awareness', Icon: Coins, practice: 'quiz', targetSec: 15, desc: 'Markets, insurance, payments and recent reforms' },
          { key: 'm_economy', name: 'Economy & Budget', Icon: BarChart3, practice: 'quiz', targetSec: 15, desc: 'GDP, inflation, fiscal policy and Budget terms' },
        ],
      },
      {
        title: 'Current Affairs & Schemes',
        topics: [
          { key: 'm_current_affairs', name: 'Current Affairs', Icon: Newspaper, practice: 'quiz', targetSec: 12, desc: 'Last 6 months: banking, economy, awards, summits' },
          { key: 'm_schemes', name: 'Government Schemes & Policies', short: 'Schemes', Icon: UsersRound, practice: 'quiz', targetSec: 15, desc: 'Financial inclusion, social security and new policies' },
        ],
      },
    ],
  },
]

// Flatten: every topic knows its subject, group and stage.
const flatten = (list, stage) => list.map((s) => ({
  ...s,
  stage,
  groups: s.groups.map((g) => ({
    ...g,
    topics: g.topics.map((t) => ({ ...t, short: t.short || t.name, subject: s.key, hue: s.hue, group: g.title, stage })),
  })),
}))

// A subject marked `hidden` is kept here (so its topics, questions and notes
// stay intact) but is not offered to students: it is left out of SUBJECTS and
// MAINS_SUBJECTS, and its Practice / Learn pages redirect (see liveSubject).
// Delete the flag to bring it back. GA is hidden for now.
const PRELIMS = flatten(SUBJECT_LIST, 'prelims')
const MAINS = flatten(MAINS_SUBJECT_LIST, 'mains')

// SUBJECTS stays Prelims only (home tiles, Learn, Practice). The admin tools
// and the topic lookups below use ALL_SUBJECTS, hidden subjects included, so
// old runs, mistakes and reports still show their topic names.
export const SUBJECTS = PRELIMS.filter((s) => !s.hidden)
export const MAINS_SUBJECTS = MAINS.filter((s) => !s.hidden)
export const ALL_SUBJECTS = [...PRELIMS, ...MAINS]

export const SUBJECT_BY_KEY = Object.fromEntries(ALL_SUBJECTS.map((s) => [s.key, s]))

export const ALL_TOPICS = ALL_SUBJECTS.flatMap((s) => s.groups.flatMap((g) => g.topics))
export const TOPIC_BY_KEY = Object.fromEntries(ALL_TOPICS.map((t) => [t.key, t]))

// Like SUBJECT_BY_KEY / TOPIC_BY_KEY, but undefined for a hidden subject, so a
// saved link to a hidden Practice or Learn page falls back to the hub.
export const liveSubject = (key) => {
  const s = SUBJECT_BY_KEY[key]
  return s && !s.hidden ? s : undefined
}
export const liveTopic = (key) => {
  const t = TOPIC_BY_KEY[key]
  return t && liveSubject(t.subject) ? t : undefined
}

// Sanqe's own speed maths drills (each has its own question bank). They're
// on the student home and free for everyone.
export const FREE_TOPIC_KEYS = ['simplification', 'approximation', 'number_series', 'wrong_number_series', 'quadratic_equations']

// Every Practice topic anyone can start without an account or a plan: the
// speed maths drills, Average and Syllogism. Everything else, in every
// subject, needs a plan (or a coaching course), see lib/practice.js. If you
// change this list, change FREE_TOPICS_NOTE there to match.
export const FREE_PRACTICE_KEYS = [...FREE_TOPIC_KEYS, 'average', 'syllogism']
export const isFreeTopic = (key) => FREE_PRACTICE_KEYS.includes(key)

// URLs
export const practicePath = (topic) => (topic.practice === 'link' ? topic.to : `/practice/${topic.subject}/${topic.key}`)
export const learnPath = (topic) => `/learn/${topic.subject}/${topic.key}`
