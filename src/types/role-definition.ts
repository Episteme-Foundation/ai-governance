import { TrustLevel } from './governance-request';

export interface ToolPermissions {
  allowed: string[];
  denied: string[];
}

export interface Constraint {
  type: string;
  description: string;
  enforcement: 'hard' | 'soft';
  parameters?: Record<string, unknown>;
  on_actions?: string[];
  paths?: string[];
  without_trust?: TrustLevel;
  limit?: number;
  [key: string]: unknown;
}

export interface RoleDefinition {
  name: string;
  purpose: string;
  acceptsTrust: TrustLevel[];
  tools: ToolPermissions;
  significantActions: string[];
  escalatesTo?: string;
  instructions: string;
  constraints: Constraint[];
}
