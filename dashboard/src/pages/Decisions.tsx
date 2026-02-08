import { useState } from 'react'
import { api, type Decision } from '../api'
import { useAsync } from '../hooks'
import { useProject } from '../App'

function statusBadge(status: string) {
  switch (status) {
    case 'adopted': return 'badge badge-green'
    case 'superseded': return 'badge badge-yellow'
    case 'reversed': return 'badge badge-red'
    default: return 'badge badge-dim'
  }
}

export default function DecisionsPage() {
  const { projectId } = useProject()
  const { data: decisions, loading, error } = useAsync(
    () => api.getDecisions(projectId),
    [projectId]
  )
  const [selected, setSelected] = useState<Decision | null>(null)

  if (!projectId) return <div className="loading">Select a project</div>
  if (loading) return <div className="loading">Loading decisions...</div>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <>
      <div className="page-header">
        <h1>Decisions</h1>
        <span className="badge badge-dim">{decisions?.length || 0} total</span>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Date</th>
              <th>Status</th>
              <th>Decision Maker</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {decisions?.map((d) => (
              <tr
                key={d.id}
                className="clickable"
                onClick={() => setSelected(selected?.id === d.id ? null : d)}
                style={selected?.id === d.id ? { background: 'var(--bg-hover)' } : undefined}
              >
                <td style={{ fontFamily: 'monospace' }}>{d.decisionNumber}</td>
                <td><strong>{d.title}</strong></td>
                <td>{new Date(d.date).toLocaleDateString()}</td>
                <td><span className={statusBadge(d.status)}>{d.status}</span></td>
                <td>{d.decisionMaker}</td>
                <td>{d.tags?.map((t) => (
                  <span key={t} className="badge badge-dim" style={{ marginRight: 4 }}>{t}</span>
                ))}</td>
              </tr>
            ))}
            {decisions?.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No decisions logged yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="detail-panel">
          <h3>Decision #{selected.decisionNumber}: {selected.title}</h3>
          <div className="detail-field">
            <label>Decision</label>
            <p>{selected.decision}</p>
          </div>
          <div className="detail-field">
            <label>Reasoning</label>
            <p>{selected.reasoning}</p>
          </div>
          {selected.considerations && (
            <div className="detail-field">
              <label>Considerations</label>
              <p>{selected.considerations}</p>
            </div>
          )}
          {selected.uncertainties && (
            <div className="detail-field">
              <label>Uncertainties</label>
              <p>{selected.uncertainties}</p>
            </div>
          )}
          {selected.reversibility && (
            <div className="detail-field">
              <label>Reversibility</label>
              <p>{selected.reversibility}</p>
            </div>
          )}
          {selected.wouldChangeIf && (
            <div className="detail-field">
              <label>Would Change If</label>
              <p>{selected.wouldChangeIf}</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
