import { useEffect } from 'react'
import { Page } from '../components/Layout'
import { TopicGroups } from '../components/Syllabus'
import { navigate } from '../lib/router'
import { learnPath, liveSubject, liveTopic } from '../lib/syllabus'
import { useNotedTopics } from '../lib/useNotedTopics'

export default function LearnSubject({ params }) {
  const subject = liveSubject(params.subject)
  const noted = useNotedTopics()
  useEffect(() => {
    if (subject) return
    // Old links were /learn/<topic>.
    const topic = liveTopic(params.subject)
    navigate(topic ? learnPath(topic) : '/learn', { replace: true, force: true })
  }, [subject, params.subject])
  if (!subject) return null

  return (
    <Page backTo="/learn">
      <div className={`topic-hero hue-${subject.hue}`}>
        <span className="subject-tile big"><subject.Icon size={26} /></span>
        <div>
          <h1 className="heading">{subject.name}</h1>
          <p className="subheading">{subject.desc}</p>
        </div>
      </div>
      <TopicGroups subject={subject} mode="learn" notes={noted} pathFor={learnPath} />
    </Page>
  )
}
