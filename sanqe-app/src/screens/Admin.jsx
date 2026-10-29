import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Page } from '../components/Layout'
import { QuestionEditor } from '../components/admin/QuestionEditor'
import { BulkImport } from '../components/admin/BulkImport'
import { Reports } from '../components/admin/Reports'
import { Coachings } from '../components/admin/Coachings'
import { Messages } from '../components/admin/Messages'
import { useApp } from '../lib/appContext'
import { fetchOpenReportCount } from '../lib/admin'
import { fetchCoachingApplications } from '../lib/coaching'
import { fetchOpenMessageCount } from '../lib/contact'

export default function Admin() {
  const { isAdmin } = useApp()
  if (isAdmin === null) return <Page title="Question admin"><div className="skeleton" style={{ height: 240 }} /></Page>
  if (!isAdmin) {
    return (
      <Page title="Question admin" backTo="/">
        <div className="empty-state card">
          <span className="empty-icon"><ShieldAlert size={22} /></span>
          <h3>Admins only</h3>
          <p>This account can&apos;t add questions.</p>
        </div>
      </Page>
    )
  }
  return <AdminPanel />
}

const TABS = [
  { key: 'add', label: 'Add / Edit' },
  { key: 'import', label: 'Bulk import' },
  { key: 'reports', label: 'Reports' },
  { key: 'coachings', label: 'Coachings' },
  { key: 'messages', label: 'Messages' },
]

function AdminPanel() {
  const [tab, setTab] = useState('add')
  const [editRequest, setEditRequest] = useState(null)
  const [openReports, setOpenReports] = useState(0)

  const refreshReportCount = useCallback(() => { fetchOpenReportCount().then(setOpenReports) }, [])
  useEffect(() => { refreshReportCount() }, [refreshReportCount])

  const [pendingCoachings, setPendingCoachings] = useState(0)
  const refreshCoachings = useCallback(() => {
    fetchCoachingApplications().then((l) => setPendingCoachings(l.filter((c) => c.status === 'pending').length)).catch(() => {})
  }, [])
  useEffect(() => { refreshCoachings() }, [refreshCoachings])

  const [openMessages, setOpenMessages] = useState(0)
  const refreshMessages = useCallback(() => { fetchOpenMessageCount().then(setOpenMessages) }, [])
  useEffect(() => { refreshMessages() }, [refreshMessages])

  // Add / Edit and Bulk import stay mounted (just hidden) so a half-filled
  // form or a checked file survives switching tabs.
  return (
    <Page title="Question admin" subtitle="Add questions from your books. They show up in Practice straight away." backTo="/" className="admin-page">
      <div className="segmented admin-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'reports' && openReports > 0 && <span className="nav-badge">{openReports}</span>}
            {t.key === 'coachings' && pendingCoachings > 0 && <span className="nav-badge">{pendingCoachings}</span>}
            {t.key === 'messages' && openMessages > 0 && <span className="nav-badge">{openMessages}</span>}
          </button>
        ))}
      </div>

      <div hidden={tab !== 'add'}><QuestionEditor editRequest={editRequest} /></div>
      <div hidden={tab !== 'import'}><BulkImport /></div>
      {tab === 'reports' && (
        <Reports
          onEdit={(topic, question) => { setEditRequest({ topic, question }); setTab('add') }}
          onChange={refreshReportCount}
        />
      )}
      {tab === 'coachings' && <Coachings onChange={refreshCoachings} />}
      {tab === 'messages' && <Messages onChange={refreshMessages} />}
    </Page>
  )
}
