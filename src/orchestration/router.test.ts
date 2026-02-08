import { RequestRouter } from './router';
import { GovernanceRequest, ProjectConfig, RoleDefinition } from '../types';

const makeRole = (overrides: Partial<RoleDefinition> = {}): RoleDefinition => ({
  name: 'reception',
  purpose: 'Handle public input',
  acceptsTrust: ['anonymous', 'contributor'],
  tools: { allowed: [], denied: [] },
  significantActions: [],
  instructions: '',
  constraints: [],
  ...overrides,
});

const makeProject = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({
  id: 'test',
  name: 'Test',
  repository: 'https://github.com/org/repo',
  constitutionPath: 'CONSTITUTION.md',
  project: { id: 'test', name: 'Test', repository: 'https://github.com/org/repo', constitution: 'CONSTITUTION.md' },
  oversight: { contacts: [], escalation_threshold: { overturned_challenges: true, constitutional_amendments: true, custom_rules: [] } },
  limits: { anonymous: { requests_per_hour: 10 }, contributor: { requests_per_hour: 100 }, authorized: { requests_per_hour: 0 } },
  roles: [
    makeRole({ name: 'reception', acceptsTrust: ['anonymous', 'contributor'] }),
    makeRole({ name: 'maintainer', acceptsTrust: ['contributor', 'authorized', 'elevated'] }),
    makeRole({ name: 'engineer', acceptsTrust: ['authorized', 'elevated'] }),
  ],
  trust: { github_roles: {}, api_keys: [] },
  mcp_servers: [],
  ...overrides,
});

const makeRequest = (overrides: Partial<GovernanceRequest> = {}): GovernanceRequest => ({
  id: 'test-id',
  timestamp: new Date().toISOString(),
  trust: 'contributor',
  source: { channel: 'github_webhook' },
  project: 'test',
  intent: 'test intent',
  payload: {},
  ...overrides,
});

describe('RequestRouter', () => {
  const router = new RequestRouter();

  describe('route with default routing', () => {
    it('should route triage intents to reception', () => {
      const request = makeRequest({ intent: 'Triage new issue #1' });
      const project = makeProject();
      const role = router.route(request, project);
      expect(role.name).toBe('reception');
    });

    it('should route governance intents to maintainer', () => {
      const request = makeRequest({ intent: 'Respond to challenge on decision' });
      const project = makeProject();
      const role = router.route(request, project);
      expect(role.name).toBe('maintainer');
    });

    it('should route development intents to engineer', () => {
      const request = makeRequest({
        intent: 'Implement feature',
        trust: 'authorized',
      });
      const project = makeProject();
      const role = router.route(request, project);
      expect(role.name).toBe('engineer');
    });
  });

  describe('route with custom routing', () => {
    it('should use project-specific routing when defined', () => {
      const project = makeProject({
        routing: {
          triage: ['maintainer'],  // Override: send triage to maintainer
        },
      });
      const request = makeRequest({ intent: 'Triage new issue #5' });
      const role = router.route(request, project);
      expect(role.name).toBe('maintainer');
    });

    it('should fall back to defaults for categories not in project routing', () => {
      const project = makeProject({
        routing: {
          triage: ['maintainer'],
          // development not overridden, should use default
        },
      });
      const request = makeRequest({
        intent: 'Implement new feature',
        trust: 'authorized',
      });
      const role = router.route(request, project);
      expect(role.name).toBe('engineer');
    });
  });
});
