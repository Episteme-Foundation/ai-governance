const API_BASE = import.meta.env.DEV ? '' : '/..';

let apiKey = localStorage.getItem('admin_api_key') || '';

export function setApiKey(key: string) {
  apiKey = key;
  localStorage.setItem('admin_api_key', key);
}

export function getApiKey(): string {
  return apiKey;
}

export function clearApiKey() {
  apiKey = '';
  localStorage.removeItem('admin_api_key');
}

function headers(): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (apiKey) h['x-admin-key'] = apiKey;
  return h;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
  if (res.status === 401) {
    clearApiKey();
    throw new Error('AUTH');
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  name: string;
  repository: string;
  status: string;
  configSource: string;
  roles: string[];
}

export interface Decision {
  id: string;
  decisionNumber: number;
  title: string;
  date: string;
  status: 'adopted' | 'superseded' | 'reversed';
  decisionMaker: string;
  projectId: string;
  decision: string;
  reasoning: string;
  considerations?: string;
  uncertainties?: string;
  reversibility?: string;
  wouldChangeIf?: string;
  tags?: string[];
}

export interface Session {
  id: string;
  projectId: string;
  role: string;
  request: unknown;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'failed' | 'blocked';
  toolUses: unknown[];
  decisionsLogged: string[];
  escalations: string[];
}

export interface Challenge {
  id: string;
  decisionId: string;
  projectId: string;
  submittedBy: string;
  submittedAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  argument: string;
  evidence?: string;
  respondedBy?: string;
  respondedAt?: string;
  response?: string;
  outcome?: string;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  projectId: string;
  sessionId?: string;
  eventType: string;
  actor: string;
  action: string;
  details?: Record<string, unknown>;
  trustLevel?: string;
}

export interface ProjectStats {
  project_id: string;
  decisions: { total: number; adopted: number };
  sessions: { total: number; active: number; completed: number; failed: number };
  challenges: { total: number; pending: number; accepted: number; rejected: number };
  pending_challenges: Challenge[];
  recent_activity: AuditEntry[];
}

// ── API calls ──────────────────────────────────────────────────────

export const api = {
  listProjects: () =>
    get<{ projects: ProjectSummary[] }>('/admin/projects').then((r) => r.projects),

  getStats: (id: string) =>
    get<ProjectStats>(`/admin/projects/${id}/stats`),

  getDecisions: (id: string, limit = 50) =>
    get<{ decisions: Decision[] }>(`/admin/projects/${id}/decisions?limit=${limit}`).then((r) => r.decisions),

  getSessions: (id: string, limit = 50) =>
    get<{ sessions: Session[] }>(`/admin/projects/${id}/sessions?limit=${limit}`).then((r) => r.sessions),

  getChallenges: (id: string, status?: string) =>
    get<{ challenges: Challenge[] }>(
      `/admin/projects/${id}/challenges${status ? `?status=${status}` : ''}`
    ).then((r) => r.challenges),

  getAudit: (id: string, limit = 100) =>
    get<{ audit_log: AuditEntry[] }>(`/admin/projects/${id}/audit?limit=${limit}`).then((r) => r.audit_log),
};
