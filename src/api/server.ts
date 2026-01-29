import Fastify, { FastifyInstance } from 'fastify';
import { GovernanceRequest } from '../types';
import { TrustClassifier } from '../orchestration/trust';
import { RequestRouter } from '../orchestration/router';
import { AgentInvoker } from '../orchestration/invoke';

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
      // TODO: Verify GitHub webhook signature
      // TODO: Parse webhook payload
      // TODO: Route to appropriate handler

      return { status: 'received' };
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
