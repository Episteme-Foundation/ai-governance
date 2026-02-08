import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  ProjectConfig,
  RateLimit,
  Contact,
  EscalationThreshold,
  McpServerConfig,
} from '../types';
import { RoleDefinition, Constraint } from '../types';
import { TrustLevel } from '../types';

/**
 * Load project configuration from YAML file
 *
 * @param projectPath - Path to the project YAML file (or project ID to load from projects/)
 * @param projectsDir - Base directory for project configs (default: ./projects)
 * @returns Parsed project configuration
 */
export function loadProjectConfig(
  projectPath: string,
  projectsDir: string = path.join(process.cwd(), 'projects')
): ProjectConfig {
  // If projectPath doesn't look like a file path, treat it as a project ID
  let configPath = projectPath;
  if (!projectPath.includes('/') && !projectPath.includes('\\')) {
    configPath = path.join(projectsDir, `${projectPath}.yaml`);
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const raw = yaml.parse(content);

  return parseProjectConfig(raw);
}

/**
 * Load project configuration by repository identifier (owner/repo)
 *
 * @param repoId - Repository identifier (e.g., "owner/repo")
 * @param projectsDir - Base directory for project configs
 * @returns Parsed project configuration, or null if not found
 */
export async function loadProjectByRepo(
  repoId: string,
  projectsDir: string = path.join(process.cwd(), 'projects')
): Promise<ProjectConfig | null> {
  // Try to find a project config that matches this repository
  if (!fs.existsSync(projectsDir)) {
    return null;
  }

  const files = fs.readdirSync(projectsDir).filter((f) => f.endsWith('.yaml'));

  for (const file of files) {
    try {
      const config = loadProjectConfig(path.join(projectsDir, file));
      // Check if repository matches (normalize for comparison)
      const configRepo = config.repository.replace(/^https?:\/\/github\.com\//, '');
      if (configRepo.toLowerCase() === repoId.toLowerCase()) {
        return config;
      }
    } catch {
      // Skip invalid configs
      continue;
    }
  }

  return null;
}

/**
 * Parse raw YAML into ProjectConfig
 */
export function parseProjectConfig(raw: Record<string, unknown>): ProjectConfig {
  const project = raw.project as Record<string, string>;
  const oversight = raw.oversight as Record<string, unknown>;
  const limits = raw.limits as Record<string, RateLimit>;
  const rawRoles = raw.roles as Array<Record<string, unknown>>;
  const trust = raw.trust as Record<string, unknown>;
  const mcpServers = raw.mcp_servers as McpServerConfig[];

  // Parse roles
  const roles: RoleDefinition[] = rawRoles.map(parseRole);

  return {
    // Convenience properties
    id: project.id,
    name: project.name,
    repository: project.repository,
    constitutionPath: project.constitution,

    // Full nested structure
    project: {
      id: project.id,
      name: project.name,
      repository: project.repository,
      constitution: project.constitution,
    },

    oversight: {
      contacts: (oversight.contacts as Contact[]) || [],
      escalation_threshold: (oversight.escalation_threshold as EscalationThreshold) || {
        overturned_challenges: true,
        constitutional_amendments: true,
        custom_rules: [],
      },
    },

    limits: {
      anonymous: limits.anonymous || { requests_per_hour: 10 },
      contributor: limits.contributor || { requests_per_hour: 100 },
      authorized: limits.authorized || { requests_per_hour: 0 },
    },

    roles,

    trust: {
      github_roles: (trust.github_roles as Record<string, TrustLevel>) || {},
      api_keys: (trust.api_keys as Array<{ name: string; trust: TrustLevel }>) || [],
    },

    mcp_servers: mcpServers || [],
  };
}

/**
 * Parse a role definition from YAML
 */
export function parseRole(raw: Record<string, unknown>): RoleDefinition {
  const tools = raw.tools as Record<string, string[]>;
  const constraints = raw.constraints as Array<Record<string, unknown>> | undefined;

  return {
    name: raw.name as string,
    purpose: raw.purpose as string,
    acceptsTrust: raw.accepts_trust as TrustLevel[],
    tools: {
      allowed: tools?.allowed || [],
      denied: tools?.denied || [],
    },
    significantActions: (raw.significant_actions as string[]) || [],
    escalatesTo: (raw.escalates_to as string) || undefined,
    instructions: (raw.instructions as string) || '',
    constraints: constraints?.map(parseConstraint) || [],
    model: (raw.model as string) || undefined,
    maxTokens: (raw.max_tokens as number) || undefined,
  };
}

/**
 * Parse a constraint from YAML
 */
function parseConstraint(raw: Record<string, unknown>): Constraint {
  return {
    type: raw.type as string,
    description: (raw.message as string) || '',
    enforcement: 'hard' as const, // Default to hard enforcement
    parameters: {
      ...raw,
      type: undefined,
      message: undefined,
    },
  };
}
