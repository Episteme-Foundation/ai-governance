import { Pool } from 'pg';
import * as path from 'path';
import { ProjectConfig } from '../types';
import { loadProjectConfig, loadProjectByRepo, parseProjectConfig } from './load-project';
import { loadGovernanceFromGitHub } from './load-governance-dir';
import { validateProjectYaml, validateAgentYaml } from './validate-config';
import { decrypt } from './encryption';

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * ProjectRegistry — DB-first config resolution with filesystem fallback
 *
 * Resolves project configurations from the database (populated from governed repos)
 * with fallback to local YAML files (for fork model and self-governance bootstrap).
 */
export class ProjectRegistry {
  private cache = new Map<string, CacheEntry<ProjectConfig>>();

  constructor(
    private readonly pool: Pool,
    private readonly projectsDir: string = path.join(process.cwd(), 'projects')
  ) {}

  /**
   * Get a project by its repository ID (e.g., "owner/repo")
   * Checks DB first, falls back to filesystem
   */
  async getByRepoId(repoId: string): Promise<ProjectConfig | null> {
    // Check in-memory cache
    const cached = this.getFromCache(`repo:${repoId}`);
    if (cached) return cached;

    // Try DB first
    const dbConfig = await this.loadFromDb(
      'SELECT * FROM projects WHERE repository ILIKE $1 AND status != $2',
      [`%${repoId}`, 'suspended']
    );

    if (dbConfig) {
      this.setCache(`repo:${repoId}`, dbConfig);
      this.setCache(`id:${dbConfig.id}`, dbConfig);
      return dbConfig;
    }

    // Fallback to filesystem
    const fsConfig = await loadProjectByRepo(repoId, this.projectsDir);
    if (fsConfig) {
      fsConfig.configSource = 'local';
      this.setCache(`repo:${repoId}`, fsConfig);
      this.setCache(`id:${fsConfig.id}`, fsConfig);
    }
    return fsConfig;
  }

  /**
   * Get a project by its project ID (e.g., "ai-governance")
   * Checks DB first, falls back to filesystem
   */
  async getById(projectId: string): Promise<ProjectConfig | null> {
    // Check in-memory cache
    const cached = this.getFromCache(`id:${projectId}`);
    if (cached) return cached;

    // Try DB first
    const dbConfig = await this.loadFromDb(
      'SELECT * FROM projects WHERE id = $1 AND status != $2',
      [projectId, 'suspended']
    );

    if (dbConfig) {
      this.setCache(`id:${projectId}`, dbConfig);
      return dbConfig;
    }

    // Fallback to filesystem
    try {
      const fsConfig = loadProjectConfig(projectId, this.projectsDir);
      fsConfig.configSource = 'local';
      this.setCache(`id:${projectId}`, fsConfig);
      return fsConfig;
    } catch {
      return null;
    }
  }

  /**
   * Register or update a project in the database
   */
  async register(
    config: ProjectConfig,
    opts?: {
      installationId?: number;
      philosophyContent?: string;
      constitutionContent?: string;
      configSource?: 'local' | 'remote';
    }
  ): Promise<void> {
    const configSource = opts?.configSource || config.configSource || 'local';

    await this.pool.query(
      `INSERT INTO projects (id, name, repository, constitution_path, config,
         github_installation_id, config_source, config_synced_at,
         philosophy_content, constitution_content, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         repository = EXCLUDED.repository,
         constitution_path = EXCLUDED.constitution_path,
         config = EXCLUDED.config,
         github_installation_id = COALESCE(EXCLUDED.github_installation_id, projects.github_installation_id),
         config_source = EXCLUDED.config_source,
         config_synced_at = NOW(),
         philosophy_content = EXCLUDED.philosophy_content,
         constitution_content = EXCLUDED.constitution_content,
         status = CASE
           WHEN projects.status = 'pending_keys' AND EXCLUDED.config_source = 'remote'
             THEN 'pending_keys'
           ELSE COALESCE(EXCLUDED.status, projects.status)
         END`,
      [
        config.id,
        config.name,
        config.repository,
        config.constitutionPath || 'CONSTITUTION.md',
        JSON.stringify(config),
        opts?.installationId || config.githubInstallationId || null,
        configSource,
        opts?.philosophyContent || null,
        opts?.constitutionContent || null,
        configSource === 'remote' ? 'pending_keys' : 'active',
      ]
    );

    // Invalidate cache
    this.clearCache(config.id);
  }

  /**
   * Sync a project configuration from its GitHub repository's .governance/ directory
   *
   * @returns The synced ProjectConfig, or null if .governance/project.yaml is missing
   */
  async syncFromRepo(
    owner: string,
    repo: string,
    installationId: number
  ): Promise<ProjectConfig | null> {
    const governance = await loadGovernanceFromGitHub(owner, repo, installationId);

    if (!governance) {
      return null;
    }

    // Validate
    const projectValidation = validateProjectYaml(governance.projectYaml);
    if (!projectValidation.valid) {
      console.warn(
        `[ProjectRegistry] Invalid .governance/project.yaml in ${owner}/${repo}:`,
        projectValidation.errors
      );
      return null;
    }

    for (const agent of governance.agents) {
      const agentValidation = validateAgentYaml(
        { name: agent.name, purpose: agent.purpose, accepts_trust: agent.acceptsTrust } as Record<string, unknown>,
        agent.name
      );
      if (!agentValidation.valid) {
        console.warn(
          `[ProjectRegistry] Invalid agent ${agent.name} in ${owner}/${repo}:`,
          agentValidation.errors
        );
      }
    }

    // Build ProjectConfig from parsed governance dir
    const rawConfig = {
      ...governance.projectYaml,
      roles: governance.agents.length > 0
        ? undefined // agents are already parsed
        : governance.projectYaml.roles,
    };

    const config = parseProjectConfig(rawConfig);

    // Override roles with parsed agents if available
    if (governance.agents.length > 0) {
      config.roles = governance.agents;
    }

    config.configSource = 'remote';
    config.githubInstallationId = installationId;

    // Register in DB
    await this.register(config, {
      installationId,
      philosophyContent: governance.philosophy,
      constitutionContent: governance.constitution,
      configSource: 'remote',
    });

    return config;
  }

  /**
   * List all registered projects
   */
  async listAll(): Promise<ProjectConfig[]> {
    const result = await this.pool.query(
      'SELECT config, config_source, status, github_installation_id FROM projects ORDER BY name'
    );

    return result.rows.map((row) => {
      const config = row.config as ProjectConfig;
      config.configSource = row.config_source;
      config.status = row.status;
      config.githubInstallationId = row.github_installation_id;
      return config;
    });
  }

  /**
   * Get the decrypted Anthropic API key for a project.
   *
   * Local projects (self-governance, fork model) use the global env var.
   * Remote projects MUST provide their own key — we never bill your key for
   * someone else's project.
   */
  async getAnthropicApiKey(projectId: string): Promise<string> {
    const result = await this.pool.query(
      'SELECT anthropic_api_key_encrypted, config_source FROM projects WHERE id = $1',
      [projectId]
    );

    const row = result.rows[0];

    // Project has its own stored key — use it regardless of source
    if (row?.anthropic_api_key_encrypted) {
      return decrypt(row.anthropic_api_key_encrypted);
    }

    // Local projects (self-governance / fork) fall back to env var
    if (!row || row.config_source === 'local') {
      const globalKey = process.env.ANTHROPIC_API_KEY;
      if (!globalKey) {
        throw new Error(`No Anthropic API key available for project: ${projectId}`);
      }
      return globalKey;
    }

    // Remote projects without a stored key cannot run
    throw new Error(
      `Remote project "${projectId}" has no Anthropic API key. ` +
      `Use POST /admin/projects/${projectId}/secrets to provide one.`
    );
  }

  /**
   * Get the decrypted OpenAI API key for a project.
   *
   * Same policy as Anthropic keys: local projects use env var,
   * remote projects must provide their own.
   */
  async getOpenAIApiKey(projectId: string): Promise<string> {
    const result = await this.pool.query(
      'SELECT openai_api_key_encrypted, config_source FROM projects WHERE id = $1',
      [projectId]
    );

    const row = result.rows[0];

    if (row?.openai_api_key_encrypted) {
      return decrypt(row.openai_api_key_encrypted);
    }

    if (!row || row.config_source === 'local') {
      const globalKey = process.env.OPENAI_API_KEY;
      if (!globalKey) {
        throw new Error(`No OpenAI API key available for project: ${projectId}`);
      }
      return globalKey;
    }

    throw new Error(
      `Remote project "${projectId}" has no OpenAI API key. ` +
      `Use POST /admin/projects/${projectId}/secrets to provide one.`
    );
  }

  /**
   * Update project status
   */
  async updateStatus(projectId: string, status: 'active' | 'pending_keys' | 'suspended'): Promise<void> {
    await this.pool.query(
      'UPDATE projects SET status = $1 WHERE id = $2',
      [status, projectId]
    );
    this.clearCache(projectId);
  }

  /**
   * Store encrypted API keys for a project
   */
  async storeSecrets(
    projectId: string,
    secrets: { anthropicApiKey?: string; openaiApiKey?: string }
  ): Promise<void> {
    // Import encrypt dynamically to avoid circular deps at module load
    const { encrypt } = await import('./encryption.js');

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (secrets.anthropicApiKey) {
      updates.push(`anthropic_api_key_encrypted = $${paramIndex++}`);
      values.push(encrypt(secrets.anthropicApiKey));
    }

    if (secrets.openaiApiKey) {
      updates.push(`openai_api_key_encrypted = $${paramIndex++}`);
      values.push(encrypt(secrets.openaiApiKey));
    }

    if (updates.length === 0) return;

    // If keys are provided, also activate the project
    updates.push(`status = 'active'`);

    values.push(projectId);
    await this.pool.query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    this.clearCache(projectId);
  }

  /**
   * Get philosophy content for a project
   * Returns DB-stored content for remote projects, null for local projects (use filesystem)
   */
  async getPhilosophyContent(projectId: string): Promise<string | null> {
    const result = await this.pool.query(
      'SELECT philosophy_content, config_source FROM projects WHERE id = $1',
      [projectId]
    );

    if (!result.rows[0]) return null;

    return result.rows[0].philosophy_content || null;
  }

  /**
   * Get constitution content for a project
   * Returns DB-stored content for remote projects, null for local projects (use filesystem)
   */
  async getConstitutionContent(projectId: string): Promise<string | null> {
    const result = await this.pool.query(
      'SELECT constitution_content, config_source FROM projects WHERE id = $1',
      [projectId]
    );

    if (!result.rows[0]) return null;

    return result.rows[0].constitution_content || null;
  }

  /**
   * Run the migration to add multi-project columns
   */
  async runMigration(): Promise<void> {
    const { readFileSync } = await import('fs');
    const migrationPath = path.join(
      __dirname, '..', 'db', 'migrations', '002-multi-project.sql'
    );
    const sql = readFileSync(migrationPath, 'utf-8');
    await this.pool.query(sql);
    console.log('[ProjectRegistry] Migration 002-multi-project.sql applied');
  }

  // --- Private helpers ---

  private async loadFromDb(
    query: string,
    params: unknown[]
  ): Promise<ProjectConfig | null> {
    const result = await this.pool.query(query, params);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const config = row.config as ProjectConfig;

    // Augment with DB-only fields
    config.configSource = row.config_source || 'local';
    config.status = row.status || 'active';
    config.githubInstallationId = row.github_installation_id || undefined;

    return config;
  }

  private getFromCache(key: string): ProjectConfig | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  private setCache(key: string, value: ProjectConfig): void {
    this.cache.set(key, { value, cachedAt: Date.now() });
  }

  private clearCache(projectId?: string): void {
    if (!projectId) {
      this.cache.clear();
      return;
    }

    // Clear all cache entries that might reference this project
    for (const [key, entry] of this.cache.entries()) {
      if (key.includes(projectId) || entry.value.id === projectId) {
        this.cache.delete(key);
      }
    }
  }
}
