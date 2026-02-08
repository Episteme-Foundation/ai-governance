import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useState, createContext, useContext } from 'react'
import { api, getApiKey, setApiKey, clearApiKey, type ProjectSummary } from './api'
import { useAsync } from './hooks'
import ProjectsPage from './pages/Projects'
import OverviewPage from './pages/Overview'
import DecisionsPage from './pages/Decisions'
import SessionsPage from './pages/Sessions'
import ChallengesPage from './pages/Challenges'
import AuditPage from './pages/Audit'

interface ProjectCtx {
  projectId: string
  setProjectId: (id: string) => void
  projects: ProjectSummary[]
}

export const ProjectContext = createContext<ProjectCtx>({
  projectId: '',
  setProjectId: () => {},
  projects: [],
})

export function useProject() {
  return useContext(ProjectContext)
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    setApiKey(key)
    try {
      await api.listProjects()
      onLogin()
    } catch (err) {
      clearApiKey()
      setError(err instanceof Error && err.message === 'AUTH'
        ? 'Invalid API key'
        : `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
    }}>
      <div className="card" style={{ maxWidth: 400, width: '100%' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>AI Governance</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Enter your admin API key to access the dashboard.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Admin API key"
            autoFocus
            style={{
              width: '100%',
              padding: '0.625rem 0.75rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '0.875rem',
              marginBottom: '1rem',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={!key || loading}
            style={{
              width: '100%',
              padding: '0.625rem',
              background: key ? 'var(--accent)' : 'var(--bg-hover)',
              color: key ? 'white' : 'var(--text-dim)',
              border: 'none',
              borderRadius: '6px',
              cursor: key ? 'pointer' : 'default',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            {loading ? 'Connecting...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Dashboard() {
  const [projectId, setProjectId] = useState('')
  const { data: projects, loading, error } = useAsync(() => api.listProjects(), [])

  // Auto-select first project
  if (projects && projects.length > 0 && !projectId) {
    setProjectId(projects[0].id)
  }

  // Auth error — bounce back to login
  if (error === 'AUTH') {
    clearApiKey()
    window.location.reload()
    return null
  }

  if (loading) return <div className="loading">Loading projects...</div>
  if (error) return <div className="error-msg">Error: {error}</div>

  return (
    <ProjectContext.Provider value={{ projectId, setProjectId, projects: projects || [] }}>
      <div className="layout">
        <aside className="sidebar">
          <h1>AI Governance</h1>
          <p className="subtitle">Dashboard</p>

          {projects && projects.length > 1 && (
            <div className="project-selector">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <nav>
            <NavLink to="/projects">Projects</NavLink>
            <NavLink to="/overview">Overview</NavLink>
            <NavLink to="/decisions">Decisions</NavLink>
            <NavLink to="/sessions">Sessions</NavLink>
            <NavLink to="/challenges">Challenges</NavLink>
            <NavLink to="/audit">Audit Log</NavLink>
          </nav>

          <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
            <button
              onClick={() => { clearApiKey(); window.location.reload() }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                padding: '0.5rem 0.75rem',
              }}
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/decisions" element={<DecisionsPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/challenges" element={<ChallengesPage />} />
            <Route path="/audit" element={<AuditPage />} />
          </Routes>
        </main>
      </div>
    </ProjectContext.Provider>
  )
}

function App() {
  const [authed, setAuthed] = useState(!!getApiKey())

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />
  }

  return <Dashboard />
}

export default App
