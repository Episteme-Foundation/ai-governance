/**
 * Validates project configuration from .governance/ directory or YAML files
 */

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a parsed project.yaml object
 */
export function validateProjectYaml(raw: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  // Required: project section
  const project = raw.project as Record<string, unknown> | undefined;
  if (!project) {
    errors.push({ path: 'project', message: 'Missing required "project" section' });
  } else {
    if (!project.id || typeof project.id !== 'string') {
      errors.push({ path: 'project.id', message: 'Missing or invalid "project.id" (must be a string)' });
    }
    if (!project.name || typeof project.name !== 'string') {
      errors.push({ path: 'project.name', message: 'Missing or invalid "project.name" (must be a string)' });
    }
    if (!project.repository || typeof project.repository !== 'string') {
      errors.push({ path: 'project.repository', message: 'Missing or invalid "project.repository" (must be a string)' });
    }
  }

  // Optional but validated: trust section
  const trust = raw.trust as Record<string, unknown> | undefined;
  if (trust) {
    const githubRoles = trust.github_roles as Record<string, string> | undefined;
    if (githubRoles) {
      const validTrustLevels = ['anonymous', 'contributor', 'authorized', 'elevated'];
      for (const [role, level] of Object.entries(githubRoles)) {
        if (!validTrustLevels.includes(level)) {
          errors.push({
            path: `trust.github_roles.${role}`,
            message: `Invalid trust level "${level}". Must be one of: ${validTrustLevels.join(', ')}`,
          });
        }
      }
    }
  }

  // Optional but validated: limits section
  const limits = raw.limits as Record<string, unknown> | undefined;
  if (limits) {
    for (const tier of ['anonymous', 'contributor', 'authorized']) {
      const limit = limits[tier] as Record<string, unknown> | undefined;
      if (limit && typeof limit.requests_per_hour !== 'number') {
        errors.push({
          path: `limits.${tier}.requests_per_hour`,
          message: 'Must be a number',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a parsed agent YAML object
 */
export function validateAgentYaml(raw: Record<string, unknown>, filename: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (!raw.name || typeof raw.name !== 'string') {
    errors.push({ path: `${filename}.name`, message: 'Missing or invalid "name" (must be a string)' });
  }

  if (!raw.purpose || typeof raw.purpose !== 'string') {
    errors.push({ path: `${filename}.purpose`, message: 'Missing or invalid "purpose" (must be a string)' });
  }

  const acceptsTrust = raw.accepts_trust as string[] | undefined;
  if (!acceptsTrust || !Array.isArray(acceptsTrust) || acceptsTrust.length === 0) {
    errors.push({ path: `${filename}.accepts_trust`, message: 'Missing or empty "accepts_trust" array' });
  }

  // Validate model if specified
  if (raw.model !== undefined && typeof raw.model !== 'string') {
    errors.push({ path: `${filename}.model`, message: '"model" must be a string' });
  }

  // Validate max_tokens if specified
  if (raw.max_tokens !== undefined && typeof raw.max_tokens !== 'number') {
    errors.push({ path: `${filename}.max_tokens`, message: '"max_tokens" must be a number' });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
