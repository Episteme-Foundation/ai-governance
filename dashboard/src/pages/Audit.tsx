import { api } from '../api'
import { useAsync } from '../hooks'
import { useProject } from '../App'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function eventBadge(eventType: string) {
  if (eventType.includes('decision')) return 'badge badge-blue'
  if (eventType.includes('challenge')) return 'badge badge-yellow'
  if (eventType.includes('escalat')) return 'badge badge-orange'
  if (eventType.includes('session')) return 'badge badge-green'
  if (eventType.includes('error') || eventType.includes('fail')) return 'badge badge-red'
  return 'badge badge-dim'
}

export default function AuditPage() {
  const { projectId } = useProject()
  const { data: entries, loading, error } = useAsync(
    () => api.getAudit(projectId),
    [projectId]
  )

  if (!projectId) return <div className="loading">Select a project</div>
  if (loading) return <div className="loading">Loading audit log...</div>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <div className="page-header">
        <h1>Audit Log</h1>
        <span className="badge badge-dim">{entries?.length || 0} entries</span>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Actor</th>
              <th>Trust</th>
              <th>Action</th>
              <th>Session</th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((entry, i) => (
              <tr key={i}>
                <td title={entry.timestamp}>{timeAgo(entry.timestamp)}</td>
                <td><span className={eventBadge(entry.eventType)}>{entry.eventType}</span></td>
                <td>{entry.actor}</td>
                <td>
                  {entry.trustLevel ? (
                    <span className="badge badge-dim">{entry.trustLevel}</span>
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>-</span>
                  )}
                </td>
                <td>{entry.action}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {entry.sessionId ? entry.sessionId.substring(0, 8) : '-'}
                </td>
              </tr>
            ))}
            {entries?.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No audit log entries</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
