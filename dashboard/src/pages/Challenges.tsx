import { useState } from 'react'
import { api, type Challenge } from '../api'
import { useAsync } from '../hooks'
import { useProject } from '../App'

function statusBadge(status: string) {
  switch (status) {
    case 'pending': return 'badge badge-yellow'
    case 'accepted': return 'badge badge-green'
    case 'rejected': return 'badge badge-red'
    case 'withdrawn': return 'badge badge-dim'
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

export default function ChallengesPage() {
  const { projectId } = useProject()
  const [filter, setFilter] = useState<string | undefined>(undefined)
  const { data: challenges, loading, error } = useAsync(
    () => api.getChallenges(projectId, filter),
    [projectId, filter]
  )
  const [selected, setSelected] = useState<Challenge | null>(null)

  if (!projectId) return <div className="loading">Select a project</div>
  if (loading) return <div className="loading">Loading challenges...</div>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <div className="page-header">
        <h1>Challenges</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['all', 'pending', 'accepted', 'rejected'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s === 'all' ? undefined : s)}
              style={{
                background: (s === 'all' ? !filter : filter === s) ? 'var(--accent)' : 'var(--bg-card)',
                color: (s === 'all' ? !filter : filter === s) ? 'white' : 'var(--text-dim)',
                border: '1px solid var(--border)',
                padding: '0.25rem 0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Decision</th>
              <th>Submitted By</th>
              <th>When</th>
              <th>Status</th>
              <th>Argument</th>
            </tr>
          </thead>
          <tbody>
            {challenges?.map((c) => (
              <tr
                key={c.id}
                className="clickable"
                onClick={() => setSelected(selected?.id === c.id ? null : c)}
                style={selected?.id === c.id ? { background: 'var(--bg-hover)' } : undefined}
              >
                <td style={{ fontFamily: 'monospace' }}>{c.decisionId}</td>
                <td>{c.submittedBy}</td>
                <td>{timeAgo(c.submittedAt)}</td>
                <td><span className={statusBadge(c.status)}>{c.status}</span></td>
                <td>{c.argument.substring(0, 80)}{c.argument.length > 80 ? '...' : ''}</td>
              </tr>
            ))}
            {challenges?.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No challenges{filter ? ` with status "${filter}"` : ''}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="detail-panel">
          <h3>Challenge on {selected.decisionId}</h3>
          <div className="detail-field">
            <label>Submitted By</label>
            <p>{selected.submittedBy} ({timeAgo(selected.submittedAt)})</p>
          </div>
          <div className="detail-field">
            <label>Status</label>
            <p><span className={statusBadge(selected.status)}>{selected.status}</span></p>
          </div>
          <div className="detail-field">
            <label>Argument</label>
            <p>{selected.argument}</p>
          </div>
          {selected.evidence && (
            <div className="detail-field">
              <label>Evidence</label>
              <p>{selected.evidence}</p>
            </div>
          )}
          {selected.response && (
            <>
              <div className="detail-field">
                <label>Response by {selected.respondedBy}</label>
                <p>{selected.response}</p>
              </div>
              {selected.outcome && (
                <div className="detail-field">
                  <label>Outcome</label>
                  <p>{selected.outcome}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
