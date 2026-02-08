import { RoleDefinition } from './role-definition';
import { TrustLevel } from './governance-request';

export interface ProjectConfig {
  // Convenience flat properties for easier access
  id: string;
  name: string;
  repository: string;
  constitutionPath: string;

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

  /** Where this config was loaded from: 'local' filesystem or 'remote' GitHub */
  configSource?: 'local' | 'remote';

  /** Project status for multi-tenant hosting */
  status?: 'active' | 'pending_keys' | 'suspended';

  /** Routing preferences: maps IntentCategory to preferred role names */
  routing?: Record<string, string[]>;

  /** GitHub App installation ID for this project */
  githubInstallationId?: number;
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
