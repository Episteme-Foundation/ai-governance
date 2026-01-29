import { RoleDefinition } from './role-definition';
import { TrustLevel } from './governance-request';

export interface ProjectConfig {
  project: {
    id: string;
    name: string;
    repository: string;
    constitution: string;
  };
  
  oversight: {
    contacts: Contact[];
    escalation_threshold: EscalationThreshold;
  };
  
  limits: {
    anonymous: RateLimit;
    contributor: RateLimit;
    authorized: RateLimit;
  };
  
  roles: RoleDefinition[];
  
  trust: {
    github_roles: Record<string, TrustLevel>;
    api_keys: ApiKey[];
  };
  
  mcp_servers: McpServerConfig[];
}

export interface Contact {
  name: string;
  email?: string;
  github?: string;
}

export interface EscalationThreshold {
  overturned_challenges: boolean;
  constitutional_amendments: boolean;
  custom_rules: CustomRule[];
}

export interface CustomRule {
  condition: string;
  action: string;
}

export interface RateLimit {
  requests_per_hour: number;
}

export interface ApiKey {
  name: string;
  trust: TrustLevel;
}

export interface McpServerConfig {
  name: string;
  type: string;
  config: Record<string, unknown>;
}
