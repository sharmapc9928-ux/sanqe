import { useEffect } from 'react'
import { Page } from '../components/Layout'
import { TopicGroups } from '../components/Syllabus'
import { useApp } from '../lib/appContext'
import { navigate } from '../lib/router'
import { liveSubject, liveTopic, practicePath } from '../lib/syllabus'

export default function SubjectPractice({ params }) {
  const subject = liveSubject(params.subject)
  const { stats, counts, refreshCounts, practiceAccess } = useApp()

  useEffect(() => {
    if (subject) return
    // Old links were /practice/<topic>.
    const topic = liveTopic(params.subject)
    navigate(topic ? practicePath(topic) : '/practice', { replace: true, force: true })
  }, [subject, params.subject])
  useEffect(() => { if (subject) refreshCounts() }, [subject, refreshCounts])
  if (!subject) return null

  return (
    <Page backTo="/practice" className="subject-page">
      <div className={`topic-hero hue-${subject.hue}`}>
        <span className="subject-tile big"><subject.Icon size={26} /></span>
        <div>
          <h1 className="heading">{subject.name}</h1>
          <p className="subheading">{subject.desc}</p>
        </div>
      </div>
      <TopicGroups subject={subject} mode="practice" counts={counts} stats={stats} pathFor={practicePath} access={practiceAccess} />
    </Page>
  )
}
