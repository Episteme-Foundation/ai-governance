import Fastify, { FastifyInstance } from 'fastify';
import * as path from 'path';
import { existsSync } from 'fs';
import { GovernanceRequest } from '../types';
import { TrustClassifier } from '../orchestration/trust';
import { RequestRouter } from '../orchestration/router';
import { AgentInvoker } from '../orchestration/invoke';
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  handleWebhookEventAsync,
} from './webhooks';
import { loadProjectByRepo, loadProjectConfig } from '../config/load-project';
import type { ProjectRegistry } from '../config/project-registry';
import type { Pool } from 'pg';
import type { DecisionRepository } from '../db/repositories/decision-repository';
import type { SessionRepository } from '../db/repositories/session-repository';
import type { ChallengeRepository } from '../db/repositories/challenge-repository';
import type { AuditRepository } from '../db/repositories/audit-repository';
import type { NotificationService } from '../notifications/notification-service';

/**
 * Fastify server for AI Governance API
 */
// Extend FastifyRequest to include rawBody
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

interface RequestStatus {
  status: 'processing' | 'completed' | 'error';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface DashboardDeps {
  pool: Pool;
  decisions: DecisionRepository;
  sessions: SessionRepository;
  challenges: ChallengeRepository;
  audit: AuditRepository;
}

export class GovernanceServer {
  private app: FastifyInstance;
  private activeRequests = new Map<string, RequestStatus>();

  constructor(
    private readonly trustClassifier: TrustClassifier,
    private readonly router: RequestRouter,
    private readonly invoker: AgentInvoker,
    private readonly refreshGitHub?: () => Promise<void>,
    private readonly registry?: ProjectRegistry,
    private readonly dashboard?: DashboardDeps,
    private readonly notifications?: NotificationService
  ) {
    this.app = Fastify({
      logger: true,
    });

    // Add custom content type parser to capture raw body for webhook signature verification
    this.app.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (req, body, done) => {
        try {
          // Store raw body on request for signature verification
          (req as unknown as { rawBody: string }).rawBody = body as string;
          const json = JSON.parse(body as string);
          done(null, json);
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    );

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check — includes version and commit for deployment verification (Issue #5)
    this.app.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        commit: process.env.GIT_COMMIT_SHA || null,
      };
    });

    // Public governance request endpoint
    this.app.post<{
      Body: {
        project_id: string;
        intent: string;
        payload?: Record<string, unknown>;
      };
    }>('/api/request', async (request, reply) => {
      const { project_id, intent, payload = {} } = request.body;

      // Create governance request
      const governanceRequest: GovernanceRequest = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        trust: 'anonymous', // Will be classified
        source: {
          channel: 'public_api',
        },
        project: project_id,
        intent,
        payload,
      };

      // Classify trust level
      governanceRequest.trust = this.trustClassifier.classify(governanceRequest);

      // Load project configuration (registry first, filesystem fallback)
      const projectConfig = await this.resolveProject(project_id);
      if (!projectConfig) {
        reply.status(404);
        return {
          request_id: governanceRequest.id,
          status: 'error',
          error: `No project configuration found for: ${project_id}`,
        };
      }

      // Route to appropriate role
      const role = this.router.route(governanceRequest, projectConfig);

      this.app.log.info({
        requestId: governanceRequest.id,
        role: role.name,
        trust: governanceRequest.trust,
      }, 'API request routed');

      // Invoke the agent
      try {
        if (this.refreshGitHub) {
          await this.refreshGitHub();
        }

        const response = await this.invoker.invoke(governanceRequest, role, projectConfig);

        return {
          request_id: governanceRequest.id,
          status: 'completed',
          trust_level: governanceRequest.trust,
          role: role.name,
          response,
        };
      } catch (error) {
        this.app.log.error({
          requestId: governanceRequest.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'API request agent invocation failed');

        return {
          status: 'error',
          request_id: governanceRequest.id,
          error: error instanceof Error ? error.message : 'Agent invocation failed',
        };
      }
    });

    // Request status endpoint
    this.app.get<{
      Params: { id: string };
    }>('/api/request/:id/status', async (request, reply) => {
      const status = this.activeRequests.get(request.params.id);
      if (!status) {
        reply.status(404);
        return { error: 'Request not found or expired' };
      }
      return { request_id: request.params.id, ...status };
    });

    // GitHub webhook endpoint
    this.app.post('/api/webhooks/github', async (request, reply) => {
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

      if (!webhookSecret) {
        this.app.log.error('GITHUB_WEBHOOK_SECRET not configured');
        reply.status(500);
        return { error: 'Webhook secret not configured' };
      }

      // Get raw body for signature verification (captured by custom content type parser)
      const rawBody = request.rawBody;
      const signature = request.headers['x-hub-signature-256'] as string | undefined;

      if (!rawBody) {
        this.app.log.error('Raw body not available for signature verification');
        reply.status(500);
        return { error: 'Raw body not available' };
      }

      // Verify webhook signature
      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        this.app.log.warn('Invalid webhook signature');
        reply.status(401);
        return { error: 'Invalid signature' };
      }

      // Parse the webhook event
      const headers: Record<string, string | undefined> = {
        'x-github-event': request.headers['x-github-event'] as string,
        'x-github-delivery': request.headers['x-github-delivery'] as string,
      };
      const event = parseWebhookEvent(headers, request.body as Record<string, unknown>);

      this.app.log.info({
        event: event.event,
        action: event.action,
        sender: event.sender,
        repo: `${event.owner}/${event.repo}`,
        deliveryId: event.deliveryId,
      }, 'Received GitHub webhook');

      // Determine project ID from repository
      const projectId = `${event.owner}/${event.repo}`;

      // Route the event to appropriate handler (async version supports installation/push events)
      const result = await handleWebhookEventAsync(event, projectId, this.registry);

      if (!result.shouldProcess) {
        this.app.log.info({ reason: result.skipReason }, 'Skipping webhook event');
        return {
          status: 'skipped',
          reason: result.skipReason,
        };
      }

      // We have a governance request to process
      const governanceRequest = result.request!;

      // Refine trust level using classifier (async for GitHub API lookup)
      governanceRequest.trust = await this.trustClassifier.classifyAsync(governanceRequest);

      this.app.log.info({
        requestId: governanceRequest.id,
        intent: governanceRequest.intent,
        trust: governanceRequest.trust,
      }, 'Processing governance request');

      // Load project configuration (registry first, filesystem fallback)
      const projectConfig = await this.resolveProject(projectId);

      if (!projectConfig) {
        this.app.log.warn({ projectId }, 'No project configuration found');
        return {
          status: 'skipped',
          request_id: governanceRequest.id,
          reason: 'No project configuration found for this repository',
        };
      }

      // Route request to appropriate role
      const role = this.router.route(governanceRequest, projectConfig);

      this.app.log.info({
        requestId: governanceRequest.id,
        role: role.name,
      }, 'Routed to role');

      // Fire off background processing — agent actions (comments, PRs) ARE the output
      this.processInBackground(governanceRequest, role, projectConfig);

      return {
        status: 'accepted',
        request_id: governanceRequest.id,
        intent: governanceRequest.intent,
        project: projectId,
        role: role.name,
      };
    });

    // Admin endpoint (requires authentication via API key header)
    this.app.post<{
      Body: {
        project_id: string;
        intent: string;
        role?: string;
        payload?: Record<string, unknown>;
      };
    }>('/admin/request', async (request, reply) => {
      // Validate admin API key
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;

      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      const { project_id, intent, role: targetRole, payload = {} } = request.body;

      const governanceRequest: GovernanceRequest = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        trust: 'elevated',
        source: {
          channel: 'admin_cli',
          identity: 'admin',
        },
        project: project_id,
        intent,
        payload,
      };

      // Load project configuration (registry first, filesystem fallback)
      const projectConfig = await this.resolveProject(project_id);

      if (!projectConfig) {
        reply.status(404);
        return {
          request_id: governanceRequest.id,
          status: 'error',
          error: `No project configuration found for: ${project_id}`,
        };
      }

      // Resolve the role before returning
      let role;
      if (targetRole) {
        role = projectConfig.roles.find(
          (r) => r.name.toLowerCase() === targetRole.toLowerCase()
        );
        if (!role) {
          reply.status(400);
          return {
            request_id: governanceRequest.id,
            status: 'error',
            error: `Role "${targetRole}" not found. Available: ${projectConfig.roles.map((r) => r.name).join(', ')}`,
          };
        }
      } else {
        role = this.router.route(governanceRequest, projectConfig);
      }

      this.app.log.info({
        requestId: governanceRequest.id,
        role: role.name,
      }, 'Admin request routed');

      // Fire off background processing
      this.processInBackground(governanceRequest, role, projectConfig);

      reply.status(202);
      return {
        status: 'accepted',
        request_id: governanceRequest.id,
        role: role.name,
      };
    });

    // Scheduled task endpoint (triggered by cron/GitHub Actions)
    this.app.post<{
      Body: {
        project_id: string;
        task: string;
        payload?: Record<string, unknown>;
      };
    }>('/api/scheduled', async (request, reply) => {
      // Validate webhook secret or admin key for scheduled tasks
      const authKey = request.headers['x-admin-key'] as string ||
                      request.headers['x-webhook-key'] as string;
      const expectedKey = process.env.ADMIN_API_KEY || process.env.SCHEDULED_TASK_KEY;

      if (expectedKey && authKey !== expectedKey) {
        reply.status(401);
        return { error: 'Unauthorized' };
      }

      const { project_id, task, payload = {} } = request.body;

      const governanceRequest: GovernanceRequest = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        trust: 'elevated',
        source: {
          channel: 'admin_cli',
          identity: 'scheduler',
        },
        project: project_id,
        intent: task,
        payload: { ...payload, scheduled: true, trigger: 'schedule' },
      };

      // Load project configuration (registry first, filesystem fallback)
      const projectConfig = await this.resolveProject(project_id);
      if (!projectConfig) {
        reply.status(404);
        return { error: `No project configuration found for: ${project_id}` };
      }

      // Route - scheduled tasks go to engineer/maintainer based on intent
      const role = this.router.route(governanceRequest, projectConfig);

      this.app.log.info({
        requestId: governanceRequest.id,
        task,
        role: role.name,
      }, 'Scheduled task routed');

      try {
        if (this.refreshGitHub) {
          await this.refreshGitHub();
        }

        const response = await this.invoker.invoke(governanceRequest, role, projectConfig);

        return {
          request_id: governanceRequest.id,
          status: 'completed',
          role: role.name,
          response,
        };
      } catch (error) {
        this.app.log.error({
          requestId: governanceRequest.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Scheduled task failed');

        return {
          status: 'error',
          request_id: governanceRequest.id,
          error: error instanceof Error ? error.message : 'Scheduled task failed',
        };
      }
    });

    // ─── Admin API Endpoints ────────────────────────────────────────

    // List all registered projects
    this.app.get('/admin/projects', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;

      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.registry) {
        return { projects: [], note: 'ProjectRegistry not initialized' };
      }

      const projects = await this.registry.listAll();
      return {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          repository: p.repository,
          status: p.status || 'active',
          configSource: p.configSource || 'local',
          roles: p.roles.map((r) => r.name),
        })),
      };
    });

    // Register a project explicitly
    this.app.post<{
      Body: {
        project_id: string;
        name: string;
        repository: string;
        config?: Record<string, unknown>;
      };
    }>('/admin/projects', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;

      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.registry) {
        reply.status(503);
        return { error: 'ProjectRegistry not initialized' };
      }

      const { project_id, name, repository } = request.body;

      // Try to load from filesystem first
      let projectConfig = await this.resolveProject(project_id);
      if (!projectConfig) {
        // Create a minimal config
        projectConfig = {
          id: project_id,
          name,
          repository,
          constitutionPath: 'CONSTITUTION.md',
          project: { id: project_id, name, repository, constitution: 'CONSTITUTION.md' },
          oversight: { contacts: [], escalation_threshold: { overturned_challenges: true, constitutional_amendments: true, custom_rules: [] } },
          limits: { anonymous: { requests_per_hour: 10 }, contributor: { requests_per_hour: 100 }, authorized: { requests_per_hour: 0 } },
          roles: [],
          trust: { github_roles: {}, api_keys: [] },
          mcp_servers: [],
          configSource: 'local',
          status: 'active',
        };
      }

      await this.registry.register(projectConfig);

      reply.status(201);
      return { status: 'registered', project_id };
    });

    // Store API keys for a project
    this.app.post<{
      Params: { id: string };
      Body: {
        anthropic_api_key?: string;
        openai_api_key?: string;
      };
    }>('/admin/projects/:id/secrets', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;

      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.registry) {
        reply.status(503);
        return { error: 'ProjectRegistry not initialized' };
      }

      const projectId = request.params.id;
      const { anthropic_api_key, openai_api_key } = request.body;

      const project = await this.registry.getById(projectId);
      if (!project) {
        reply.status(404);
        return { error: `Project not found: ${projectId}` };
      }

      await this.registry.storeSecrets(projectId, {
        anthropicApiKey: anthropic_api_key,
        openaiApiKey: openai_api_key,
      });

      return {
        status: 'updated',
        project_id: projectId,
        keys_stored: {
          anthropic: !!anthropic_api_key,
          openai: !!openai_api_key,
        },
      };
    });

    // ─── Dashboard API Endpoints ──────────────────────────────────────

    // Get decisions for a project
    this.app.get<{
      Params: { id: string };
      Querystring: { limit?: string; status?: string };
    }>('/admin/projects/:id/decisions', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;
      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.dashboard) {
        reply.status(503);
        return { error: 'Dashboard not initialized' };
      }

      const projectId = request.params.id;
      const limit = parseInt(request.query.limit || '50', 10);

      const decisions = await this.dashboard.decisions.getByProject(projectId, limit);
      return { project_id: projectId, decisions };
    });

    // Get sessions for a project
    this.app.get<{
      Params: { id: string };
      Querystring: { limit?: string; status?: string };
    }>('/admin/projects/:id/sessions', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;
      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.dashboard) {
        reply.status(503);
        return { error: 'Dashboard not initialized' };
      }

      const projectId = request.params.id;
      const limit = parseInt(request.query.limit || '50', 10);
      const status = request.query.status;

      // Use existing repo methods; for a richer query we hit the pool directly
      if (status === 'active') {
        const sessions = await this.dashboard.sessions.getActive(projectId);
        return { project_id: projectId, sessions };
      }

      // General list: all sessions ordered by started_at DESC
      const result = await this.dashboard.pool.query(
        `SELECT * FROM sessions WHERE project_id = $1 ORDER BY started_at DESC LIMIT $2`,
        [projectId, limit]
      );

      const sessions = result.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        projectId: row.project_id,
        role: row.role,
        request: row.request,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        status: row.status,
        toolUses: (row.tool_uses as unknown[]) || [],
        decisionsLogged: (row.decisions_logged as string[]) || [],
        escalations: (row.escalations as string[]) || [],
      }));

      return { project_id: projectId, sessions };
    });

    // Get challenges for a project
    this.app.get<{
      Params: { id: string };
      Querystring: { status?: string };
    }>('/admin/projects/:id/challenges', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;
      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.dashboard) {
        reply.status(503);
        return { error: 'Dashboard not initialized' };
      }

      const projectId = request.params.id;
      const status = request.query.status;

      const challenges = await this.dashboard.challenges.getByProject(projectId, status);
      return { project_id: projectId, challenges };
    });

    // Get audit log for a project
    this.app.get<{
      Params: { id: string };
      Querystring: { limit?: string };
    }>('/admin/projects/:id/audit', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;
      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.dashboard) {
        reply.status(503);
        return { error: 'Dashboard not initialized' };
      }

      const projectId = request.params.id;
      const limit = parseInt(request.query.limit || '100', 10);

      const entries = await this.dashboard.audit.getByProject(projectId, limit);
      return { project_id: projectId, audit_log: entries };
    });

    // Get aggregate stats for a project
    this.app.get<{
      Params: { id: string };
    }>('/admin/projects/:id/stats', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;
      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.dashboard) {
        reply.status(503);
        return { error: 'Dashboard not initialized' };
      }

      const projectId = request.params.id;

      // Run all stat queries in parallel
      const [decisionsResult, sessionsResult, challengesResult, pendingChallenges, recentActivity] = await Promise.all([
        this.dashboard.pool.query(
          'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = $2) as adopted FROM decisions WHERE project_id = $1',
          [projectId, 'adopted']
        ),
        this.dashboard.pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE status = 'active') as active,
                  COUNT(*) FILTER (WHERE status = 'completed') as completed,
                  COUNT(*) FILTER (WHERE status = 'failed') as failed
           FROM sessions WHERE project_id = $1`,
          [projectId]
        ),
        this.dashboard.pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE status = 'pending') as pending,
                  COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
                  COUNT(*) FILTER (WHERE status = 'rejected') as rejected
           FROM challenges WHERE project_id = $1`,
          [projectId]
        ),
        this.dashboard.challenges.getByProject(projectId, 'pending'),
        this.dashboard.audit.getByProject(projectId, 10),
      ]);

      return {
        project_id: projectId,
        decisions: {
          total: parseInt(decisionsResult.rows[0].total, 10),
          adopted: parseInt(decisionsResult.rows[0].adopted, 10),
        },
        sessions: {
          total: parseInt(sessionsResult.rows[0].total, 10),
          active: parseInt(sessionsResult.rows[0].active, 10),
          completed: parseInt(sessionsResult.rows[0].completed, 10),
          failed: parseInt(sessionsResult.rows[0].failed, 10),
        },
        challenges: {
          total: parseInt(challengesResult.rows[0].total, 10),
          pending: parseInt(challengesResult.rows[0].pending, 10),
          accepted: parseInt(challengesResult.rows[0].accepted, 10),
          rejected: parseInt(challengesResult.rows[0].rejected, 10),
        },
        pending_challenges: pendingChallenges,
        recent_activity: recentActivity,
      };
    });

    // ─── Notification Endpoints ─────────────────────────────────────

    // Trigger notification checks (called by cron/scheduler)
    this.app.post('/admin/notifications/check', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;
      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.notifications) {
        reply.status(503);
        return { error: 'Notification service not initialized' };
      }

      // Run checks in background
      this.notifications.runAllChecks().catch((err) =>
        this.app.log.error({ err }, 'Notification check failed')
      );

      return { status: 'started', message: 'Notification checks triggered' };
    });

    // Generate weekly summary for a project
    this.app.post<{
      Params: { id: string };
    }>('/admin/projects/:id/summary', async (request, reply) => {
      const adminKey = request.headers['x-admin-key'] as string | undefined;
      const expectedKey = process.env.ADMIN_API_KEY;
      if (expectedKey && adminKey !== expectedKey) {
        reply.status(401);
        return { error: 'Invalid admin API key' };
      }

      if (!this.notifications) {
        reply.status(503);
        return { error: 'Notification service not initialized' };
      }

      const projectId = request.params.id;
      await this.notifications.generateSummary(projectId);

      return { status: 'sent', project_id: projectId };
    });

    // ─── Serve Dashboard Static Files ─────────────────────────────────

    const dashboardPath = path.join(__dirname, '..', '..', 'dashboard', 'dist');
    if (existsSync(dashboardPath)) {
      // Dynamic import to avoid hard dependency on @fastify/static
      import('@fastify/static').then((mod) => {
        const fastifyStatic = mod.default;
        this.app.register(fastifyStatic, {
          root: dashboardPath,
          prefix: '/dashboard/',
          decorateReply: false,
        });
      }).catch(() => {
        this.app.log.info('@fastify/static not available, skipping dashboard');
      });

      // SPA fallback for dashboard routes
      this.app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/dashboard')) {
          reply.sendFile('index.html', dashboardPath);
        } else {
          reply.status(404).send({ error: 'Not found' });
        }
      });
    }
  }

  /**
   * Process a governance request in the background.
   * Agent actions (comments, PRs, merges) ARE the output — no HTTP response needed.
   */
  private processInBackground(
    request: GovernanceRequest,
    role: import('../types').RoleDefinition,
    project: import('../types').ProjectConfig
  ): void {
    this.trackRequest(request.id, 'processing');

    const run = async () => {
      if (this.refreshGitHub) {
        await this.refreshGitHub();
      }
      const response = await this.invoker.invoke(request, role, project);
      this.app.log.info({
        requestId: request.id,
        responseLength: response.length,
      }, 'Background processing completed');
      this.trackRequest(request.id, 'completed');
    };

    run().catch((error) => {
      this.app.log.error({
        requestId: request.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Background processing failed');
      this.trackRequest(request.id, 'error', error instanceof Error ? error.message : 'Unknown error');
    });
  }

  private trackRequest(id: string, status: RequestStatus['status'], error?: string): void {
    const existing = this.activeRequests.get(id);
    if (status === 'processing') {
      this.activeRequests.set(id, { status, startedAt: new Date().toISOString() });
      // Auto-expire after 1 hour
      setTimeout(() => this.activeRequests.delete(id), 60 * 60 * 1000);
    } else {
      this.activeRequests.set(id, {
        status,
        startedAt: existing?.startedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        ...(error && { error }),
      });
    }
  }

  /**
   * Resolve project config: registry first, filesystem fallback
   */
  private async resolveProject(projectId: string): Promise<import('../types').ProjectConfig | null> {
    if (this.registry) {
      // Try by repo ID first (owner/repo), then by project ID
      const config = await this.registry.getByRepoId(projectId)
        || await this.registry.getById(projectId);
      if (config) return config;
    }

    // Filesystem fallback
    const fsConfig = await loadProjectByRepo(projectId);
    if (fsConfig) return fsConfig;

    try {
      return loadProjectConfig(projectId);
    } catch {
      return null;
    }
  }

  async start(port: number = 3000): Promise<void> {
    try {
      await this.app.listen({ port, host: '0.0.0.0' });
      console.log(`Governance server listening on port ${port}`);
    } catch (err) {
      this.app.log.error(err);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  getApp(): FastifyInstance {
    return this.app;
  }
}
