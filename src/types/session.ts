import { GovernanceRequest } from './governance-request';

export interface AgentSession {
  id: string;
  project: string;
  role: string;
  request: GovernanceRequest;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'failed' | 'blocked';
  
  // Tracking
  toolUses: ToolUse[];
  decisionsLogged: string[];
  escalations: string[];
}

export interface ToolUse {
  timestamp: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  blocked?: boolean;
  blockReason?: string;
}
