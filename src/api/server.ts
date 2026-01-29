import Fastify, { FastifyInstance } from 'fastify';
import { GovernanceRequest } from '../types';
import { TrustClassifier } from '../orchestration/trust';
import { RequestRouter } from '../orchestration/router';
import { AgentInvoker } from '../orchestration/invoke';
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  handleWebhookEvent,
} from './webhooks';
import { loadProjectByRepo } from '../config/load-project';

/**
 * Fastify server for AI Governance API
 */
export class GovernanceServer {
  private app: FastifyInstance;

  constructor(
    private readonly trustClassifier: TrustClassifier,
    private readonly router: RequestRouter,
    private readonly invoker: AgentInvoker
  ) {
    this.app = Fastify({
      logger: true,
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
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

      // TODO: Load project config, route to role, invoke agent
      // For now, return a placeholder

      return {
        request_id: governanceRequest.id,
        status: 'received',
        trust_level: governanceRequest.trust,
      };
    });

    // GitHub webhook endpoint
    this.app.post('/api/webhooks/github', async (request, reply) => {
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

      if (!webhookSecret) {
        this.app.log.error('GITHUB_WEBHOOK_SECRET not configured');
        reply.status(500);
        return { error: 'Webhook secret not configured' };
      }

      // Get raw body for signature verification
      // Fastify parses JSON by default, so we need to access the raw body
      const rawBody = JSON.stringify(request.body);
      const signature = request.headers['x-hub-signature-256'] as string | undefined;

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

      // Route the event to appropriate handler
      const result = handleWebhookEvent(event, projectId);

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

      // Load project configuration
      const projectConfig = await loadProjectByRepo(projectId);

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

      // Invoke the agent
      try {
        const response = await this.invoker.invoke(governanceRequest, role, projectConfig);

        this.app.log.info({
          requestId: governanceRequest.id,
          responseLength: response.length,
        }, 'Agent completed');

        return {
          status: 'completed',
          request_id: governanceRequest.id,
          trust_level: governanceRequest.trust,
          intent: governanceRequest.intent,
          project: projectId,
          role: role.name,
          response,
        };
      } catch (error) {
        this.app.log.error({
          requestId: governanceRequest.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Agent invocation failed');

        return {
          status: 'error',
          request_id: governanceRequest.id,
          error: error instanceof Error ? error.message : 'Agent invocation failed',
        };
      }
    });

    // Admin endpoint (requires authentication)
    this.app.post<{
      Body: {
        project_id: string;
        intent: string;
        payload?: Record<string, unknown>;
      };
    }>('/admin/request', async (request, reply) => {
      const { project_id, intent, payload = {} } = request.body;

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

      // TODO: Authenticate admin request
      // TODO: Load project, route, invoke

      return {
        request_id: governanceRequest.id,
        status: 'received',
      };
    });
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
