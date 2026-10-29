import { ArrowRight, Lock } from 'lucide-react'
import { Page } from '../components/Layout'
import { EmptyState } from '../components/ui'
import { linkProps } from '../lib/router'

// Shown in place of Practice, Daily, Mock Tests and Learn until the student
// has a course from their coaching.
export default function CourseLock() {
  return (
    <Page backTo="/">
      <EmptyState
        icon={Lock}
        level={1}
        title="Join a course to unlock this"
        action={(
          <>
            <a className="btn primary" {...linkProps('/courses')}>Go to Courses <ArrowRight size={15} /></a>
            <a className="btn" {...linkProps('/unlock')}>Get FEDGE All-Access</a>
          </>
        )}
      >
        Practice, Daily Challenge, Learn and the descriptive mocks open once you join a course from your coaching
        or get FEDGE All-Access. Till then, play the Circle Game and the speed maths drills on your home screen.
      </EmptyState>
    </Page>
  )
}
