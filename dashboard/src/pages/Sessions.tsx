import { useState } from 'react'
import { api, type Session } from '../api'
import { useAsync } from '../hooks'
import { useProject } from '../App'

function statusBadge(status: string) {
  switch (status) {
    case 'active': return 'badge badge-blue'
    case 'completed': return 'badge badge-green'
    case 'failed': return 'badge badge-red'
    case 'blocked': return 'badge badge-orange'
    default: return 'badge badge-dim'
  }
}

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

function duration(start: string, end?: string): string {
  const endTime = end ? new Date(end).getTime() : Date.now()
  const ms = endTime - new Date(start).getTime()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function SessionsPage() {
  const { projectId } = useProject()
  const { data: sessions, loading, error } = useAsync(
    () => api.getSessions(projectId),
    [projectId]
  )
  const [selected, setSelected] = useState<Session | null>(null)

  if (!projectId) return <div className="loading">Select a project</div>
  if (loading) return <div className="loading">Loading sessions...</div>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <div className="page-header">
        <h1>Sessions</h1>
        <span className="badge badge-dim">{sessions?.length || 0} total</span>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Role</th>
              <th>Status</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Tools</th>
              <th>Decisions</th>
              <th>Escalations</th>
            </tr>
          </thead>
          <tbody>
            {sessions?.map((s) => (
              <tr
                key={s.id}
                className="clickable"
                onClick={() => setSelected(selected?.id === s.id ? null : s)}
                style={selected?.id === s.id ? { background: 'var(--bg-hover)' } : undefined}
              >
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.id.substring(0, 8)}</td>
                <td><span className="badge badge-blue">{s.role}</span></td>
                <td><span className={statusBadge(s.status)}>{s.status}</span></td>
                <td>{timeAgo(s.startedAt)}</td>
                <td>{duration(s.startedAt, s.endedAt)}</td>
                <td>{s.toolUses.length}</td>
                <td>{s.decisionsLogged.length}</td>
                <td>
                  {s.escalations.length > 0 ? (
                    <span className="badge badge-orange">{s.escalations.length}</span>
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>0</span>
                  )}
                </td>
              </tr>
            ))}
            {sessions?.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No sessions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="detail-panel">
          <h3>Session {selected.id.substring(0, 8)}</h3>
          <div className="detail-field">
            <label>Role</label>
            <p>{selected.role}</p>
          </div>
          <div className="detail-field">
            <label>Status</label>
            <p>{selected.status}</p>
          </div>
          <div className="detail-field">
            <label>Request</label>
            <p>{JSON.stringify(selected.request, null, 2)}</p>
          </div>
          {selected.decisionsLogged.length > 0 && (
            <div className="detail-field">
              <label>Decisions Logged</label>
              <p>{selected.decisionsLogged.join(', ')}</p>
            </div>
          )}
          {selected.escalations.length > 0 && (
            <div className="detail-field">
              <label>Escalations</label>
              <p>{selected.escalations.join(', ')}</p>
            </div>
          )}
          {selected.toolUses.length > 0 && (
            <div className="detail-field">
              <label>Tool Uses ({selected.toolUses.length})</label>
              <p>{JSON.stringify(selected.toolUses, null, 2)}</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
