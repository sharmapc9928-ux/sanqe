export const DREAM_JOBS = [
  {
    group: 'Banking',
    items: ['SBI PO', 'SBI Clerk', 'IBPS PO', 'IBPS Clerk', 'IBPS RRB PO', 'IBPS RRB Office Assistant', 'RBI Grade B', 'RBI Assistant', 'NABARD Grade A', 'SEBI Grade A'],
  },
  {
    group: 'Insurance',
    items: ['LIC AAO', 'LIC ADO', 'NIACL AO', 'Oriental Insurance AO', 'United India Insurance AO'],
  },
]

export const DREAM_JOB_SUGGESTIONS = DREAM_JOBS.flatMap((g) => g.items)
