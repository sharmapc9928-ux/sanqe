import { Page } from '../components/Layout'
import { SubjectCard } from '../components/Syllabus'
import { SUBJECTS } from '../lib/syllabus'

export default function LearnHub() {
  return (
    <Page title="Learn" subtitle="Revision notes for every subject, organised the same way as Practice.">
      <div className="subject-grid">
        {SUBJECTS.map((s) => <SubjectCard key={s.key} subject={s} to={`/learn/${s.key}`} />)}
      </div>
    </Page>
  )
}
