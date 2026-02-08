import { useProject } from '../App'

function statusBadge(status: string) {
  switch (status) {
    case 'active': return 'badge badge-green'
    case 'pending_keys': return 'badge badge-yellow'
    case 'suspended': return 'badge badge-red'
    default: return 'badge badge-dim'
  }
}

export default function ProjectsPage() {
  const { projects, setProjectId } = useProject()

  return (
    <>
      <div className="page-header">
        <h1>Registered Projects</h1>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>ID</th>
              <th>Repository</th>
              <th>Status</th>
              <th>Source</th>
              <th>Roles</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr
                key={p.id}
                className="clickable"
                onClick={() => setProjectId(p.id)}
              >
                <td><strong>{p.name}</strong></td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.id}</td>
                <td>{p.repository}</td>
                <td><span className={statusBadge(p.status)}>{p.status}</span></td>
                <td><span className="badge badge-dim">{p.configSource}</span></td>
                <td>{p.roles.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
