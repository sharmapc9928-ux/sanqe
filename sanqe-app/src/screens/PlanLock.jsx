import { Page } from '../components/Layout'
import { PlanGate } from '../components/PlanGate'

// Shown in place of the Mistake Notebook until the student has a Prelims +
// Mains plan, and in place of the focus timer until they have any plan (a
// coaching course opens both).
export default function PlanLock({ path }) {
  const notebook = path.startsWith('/review')
  return (
    <Page backTo="/practice">
      <PlanGate
        title={notebook ? 'The Mistake Notebook is part of the Prelims + Mains plans' : 'The focus timer needs a Practice plan'}
        returnTo={path}
        returnLabel={notebook ? 'the Mistake Notebook' : 'the focus timer'}
        tier={notebook ? 'full' : undefined}
      >
        {notebook
          ? 'Every wrong answer is saved and brought back after 1, 3 and 7 days, with its explanation.'
          : 'Pomodoro and 52 / 17 study blocks that keep running across the app.'}
      </PlanGate>
    </Page>
  )
}
