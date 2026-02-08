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

export default function OverviewPage() {
  const { projectId } = useProject()
  const { data: stats, loading, error } = useAsync(
    () => api.getStats(projectId),
    [projectId]
  )

  if (!projectId) return <div className="loading">Select a project</div>
  if (loading) return <div className="loading">Loading stats...</div>
  if (error) return <div className="error-msg">Error: {error}</div>
  if (!stats) return null

  return (
    <>
      <div className="page-header">
        <h1>Overview</h1>
      </div>

      <div className="stat-grid">
        <div className="card">
          <h2>Decisions</h2>
          <div className="stat-value">{stats.decisions.total}</div>
          <div className="stat-label">{stats.decisions.adopted} adopted</div>
        </div>

        <div className="card">
          <h2>Sessions</h2>
          <div className="stat-value">{stats.sessions.total}</div>
          <div className="stat-label">
            {stats.sessions.active} active / {stats.sessions.completed} completed / {stats.sessions.failed} failed
          </div>
        </div>

        <div className="card">
          <h2>Challenges</h2>
          <div className="stat-value">{stats.challenges.total}</div>
          <div className="stat-label">
            {stats.challenges.pending} pending / {stats.challenges.accepted} accepted / {stats.challenges.rejected} rejected
          </div>
        </div>

        <div className="card">
          <h2>Pending Challenges</h2>
          <div className="stat-value" style={{ color: stats.challenges.pending > 0 ? 'var(--yellow)' : undefined }}>
            {stats.challenges.pending}
          </div>
          <div className="stat-label">require attention</div>
        </div>
      </div>

      {stats.pending_challenges.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2>Pending Challenges</h2>
          <table>
            <thead>
              <tr>
                <th>Decision</th>
                <th>Submitted By</th>
                <th>When</th>
                <th>Argument</th>
              </tr>
            </thead>
            <tbody>
              {stats.pending_challenges.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace' }}>{c.decisionId}</td>
                  <td>{c.submittedBy}</td>
                  <td>{timeAgo(c.submittedAt)}</td>
                  <td>{c.argument.substring(0, 100)}{c.argument.length > 100 ? '...' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Recent Activity</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Actor</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {stats.recent_activity.map((entry, i) => (
              <tr key={i}>
                <td>{timeAgo(entry.timestamp)}</td>
                <td><span className="badge badge-blue">{entry.eventType}</span></td>
                <td>{entry.actor}</td>
                <td>{entry.action}</td>
              </tr>
            ))}
            {stats.recent_activity.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No recent activity</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
