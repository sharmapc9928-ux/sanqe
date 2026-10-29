// Institution logos for the exam cards on the Mock Tests screen. Exams from
// the same institution share one logo. The images are hotlinked: if one fails
// to load the card falls back to a text badge. For production, download them
// into public/logos/ and point `url` at /logos/<file>.
export const LOGOS = {
  sbi: { name: 'State Bank of India', url: 'https://commons.wikimedia.org/wiki/Special:FilePath/State_Bank_of_India.svg' },
  ibps: { name: 'Institute of Banking Personnel Selection', url: 'https://commons.wikimedia.org/wiki/Special:FilePath/IBPS_Logo.png' },
  rrb: { name: 'Regional Rural Banks', url: 'https://static.pib.gov.in/WriteReadData/userfiles/image/image001N38B.png' },
  rbi: { name: 'Reserve Bank of India', url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Reserve_Bank_of_India_logo.svg' },
  nabard: { name: 'NABARD', url: 'https://www.presentations.gov.in/wp-content/uploads/2020/06/NABARD.svg' },
  sebi: { name: 'Securities and Exchange Board of India', url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Securities_and_Exchange_Board_of_India.png' },
  lic: { name: 'Life Insurance Corporation of India', url: 'https://www.presentations.gov.in/wp-content/uploads/2020/06/LIC.svg' },
}

// RRB Clerk (Office Assistant) reuses the RRB PO logo.
export const MOCK_EXAMS = [
  { slug: 'sbi-po', name: 'SBI PO', logo: 'sbi' },
  { slug: 'sbi-clerk', name: 'SBI Clerk', logo: 'sbi' },
  { slug: 'sbi-so', name: 'SBI SO', logo: 'sbi' },
  { slug: 'ibps-po', name: 'IBPS PO', logo: 'ibps' },
  { slug: 'ibps-clerk', name: 'IBPS Clerk', logo: 'ibps' },
  { slug: 'ibps-so', name: 'IBPS SO', logo: 'ibps' },
  { slug: 'ibps-rrb-po', name: 'IBPS RRB PO', logo: 'rrb' },
  { slug: 'ibps-rrb-clerk', name: 'IBPS RRB Clerk', logo: 'rrb' },
  { slug: 'rbi-grade-b', name: 'RBI Grade B', logo: 'rbi' },
  { slug: 'rbi-assistant', name: 'RBI Assistant', logo: 'rbi' },
  { slug: 'nabard-grade-a', name: 'NABARD Grade A', logo: 'nabard' },
  { slug: 'nabard-grade-b', name: 'NABARD Grade B', logo: 'nabard' },
  { slug: 'sebi-grade-a', name: 'SEBI Grade A', logo: 'sebi' },
  { slug: 'lic-aao', name: 'LIC AAO', logo: 'lic' },
]

// Paper pattern of every exam: the sections of each stage, with questions,
// marks and minutes per section. A Full Test is the sum of its sections.
// IBPS RRB PO / Clerk, SBI Clerk Mains, IBPS PO and IBPS Clerk follow the
// patterns Rohit gave in the deep-research report (2026-10-29); the other
// exams are approximate, so check them against the latest notification.
// Every paper marks ¼ of the question's marks off for a wrong answer.
const sec = (name, q, marks, min) => ({ name, q, marks, min })

const BANK_PRE = [sec('English Language', 30, 30, 20), sec('Quantitative Aptitude', 35, 35, 20), sec('Reasoning Ability', 35, 35, 20)]
const RRB_PRE = [sec('Reasoning Ability', 40, 40, 25), sec('Quantitative Aptitude', 40, 40, 20)]
const PO_MAINS = [
  sec('Reasoning & Computer Aptitude', 45, 60, 60),
  sec('Data Analysis & Interpretation', 35, 60, 45),
  sec('General / Economy / Banking Awareness', 40, 40, 35),
  sec('English Language', 35, 40, 40),
]
const SBI_CLERK_MAINS = [
  sec('General / Financial Awareness', 50, 50, 35),
  sec('General English', 40, 40, 35),
  sec('Reasoning Ability & Computer Aptitude', 50, 60, 45),
  sec('Quantitative Aptitude', 50, 50, 45),
]
// IBPS Clerk Mains dropped the Computer section; one 125-minute clock, so the
// minutes here are only a suggested split for a sectional test.
const IBPS_CLERK_MAINS = [
  sec('General / Banking Awareness', 40, 50, 30),
  sec('English Language', 40, 40, 25),
  sec('Reasoning Ability', 40, 60, 40),
  sec('Quantitative Aptitude', 40, 50, 30),
]
// RRB Mains run on one 120-minute clock (same split note as above).
const RRB_MAINS = [
  sec('Reasoning Ability', 40, 50, 30),
  sec('General Awareness', 40, 40, 20),
  sec('English / Hindi Language', 40, 40, 25),
  sec('Quantitative Aptitude', 40, 50, 30),
  sec('Computer Knowledge', 40, 20, 15),
]
const NABARD_PRE = [
  sec('Reasoning Ability', 20, 20, 15), sec('English Language', 40, 40, 20), sec('Quantitative Aptitude', 20, 20, 15),
  sec('General Awareness', 20, 20, 15), sec('Computer Knowledge', 20, 20, 10),
]
const NABARD_MAINS = [sec('Economic & Social Issues', 40, 40, 45), sec('Agriculture & Rural Development', 40, 40, 45)]

export const SECTIONS = {
  'sbi-po': { pre: BANK_PRE, mains: PO_MAINS },
  'ibps-po': { pre: BANK_PRE, mains: PO_MAINS },
  'sbi-clerk': { pre: BANK_PRE, mains: SBI_CLERK_MAINS },
  'ibps-clerk': { pre: BANK_PRE, mains: IBPS_CLERK_MAINS },
  'sbi-so': { pre: BANK_PRE, mains: [sec('Professional Knowledge', 60, 60, 45), sec('English Language', 30, 30, 20)] },
  'ibps-so': { pre: BANK_PRE, mains: [sec('Professional Knowledge', 60, 60, 45)] },
  'ibps-rrb-po': { pre: RRB_PRE, mains: RRB_MAINS },
  'ibps-rrb-clerk': { pre: RRB_PRE, mains: RRB_MAINS },
  'rbi-grade-b': {
    pre: [sec('General Awareness', 80, 80, 25), sec('English Language', 30, 30, 25), sec('Quantitative Aptitude', 30, 30, 25), sec('Reasoning Ability', 60, 60, 45)],
    mains: [sec('Economic & Social Issues', 30, 50, 90), sec('Finance & Management', 30, 50, 90), sec('English Language', 2, 50, 90)],
  },
  'rbi-assistant': {
    pre: BANK_PRE,
    mains: [
      sec('English Language', 40, 40, 20), sec('Quantitative Aptitude', 50, 50, 30), sec('Reasoning Ability', 50, 50, 30),
      sec('Computer Knowledge', 20, 20, 15), sec('General Awareness', 40, 40, 25),
    ],
  },
  'nabard-grade-a': { pre: NABARD_PRE, mains: NABARD_MAINS },
  'nabard-grade-b': { pre: NABARD_PRE, mains: NABARD_MAINS },
  'sebi-grade-a': {
    pre: [sec('General Awareness', 50, 50, 25), sec('English Language', 40, 40, 25), sec('Quantitative Aptitude', 40, 40, 25), sec('Reasoning Ability', 40, 40, 25)],
    mains: [sec('Economics & Finance', 50, 50, 45), sec('Management & Law', 50, 50, 45), sec('English Language', 2, 50, 45)],
  },
  'lic-aao': {
    pre: BANK_PRE,
    mains: [
      sec('Reasoning Ability', 35, 35, 25), sec('General Awareness', 40, 40, 25), sec('Insurance & Financial Marketing Awareness', 40, 40, 25),
      sec('Quantitative Aptitude', 35, 35, 25), sec('English Language', 30, 30, 20),
    ],
  },
}

// Papers that run on one clock for the whole paper (no sectional time limit);
// every other paper times each section separately.
const ONE_CLOCK = new Set(['ibps-rrb-po:pre', 'ibps-rrb-po:mains', 'ibps-rrb-clerk:pre', 'ibps-rrb-clerk:mains', 'ibps-clerk:mains'])
export const isOneClock = (slug, stage) => ONE_CLOCK.has(`${slug}:${stage}`)

// Written paper that comes after the objective Mains; it is not part of a Full Test.
export const DESCRIPTIVE = {
  'ibps-po': { name: 'English Descriptive (Essay & Letter)', q: 2, marks: 25, min: 30 },
}

export const FULL_MOCKS = 10
export const SECTIONAL_MOCKS = 5

const sum = (list, key) => list.reduce((t, x) => t + x[key], 0)
export const totalsOf = (sections) => ({ q: sum(sections, 'q'), marks: sum(sections, 'marks'), min: sum(sections, 'min') })
