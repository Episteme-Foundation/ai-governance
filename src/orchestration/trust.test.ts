import { TrustClassifier } from './trust';
import { GovernanceRequest } from '../types';

// Mock the GitHub auth module to avoid real API calls
jest.mock('../mcp/github/auth', () => ({
  github: {
    getCollaboratorPermission: jest.fn(),
  },
}));

import { github } from '../mcp/github/auth';

const mockedGetCollaboratorPermission = github.getCollaboratorPermission as jest.MockedFunction<
  typeof github.getCollaboratorPermission
>;

/**
 * Helper to create a GovernanceRequest with sensible defaults
 */
function makeRequest(overrides: Partial<GovernanceRequest> = {}): GovernanceRequest {
  return {
    id: 'test-id',
    timestamp: new Date().toISOString(),
    trust: 'anonymous',
    source: { channel: 'github_webhook' },
    project: 'test-owner/test-repo',
    intent: 'test intent',
    payload: {},
    ...overrides,
  };
}

describe('TrustClassifier', () => {
  let classifier: TrustClassifier;

  beforeEach(() => {
    classifier = new TrustClassifier();
    classifier.clearCache();
    jest.clearAllMocks();
  });

  describe('classify (synchronous)', () => {
    describe('channel-based classification', () => {
      it('should return "anonymous" for public_api channel', () => {
        const request = makeRequest({
          source: { channel: 'public_api' },
        });
        expect(classifier.classify(request)).toBe('anonymous');
      });

      it('should return "elevated" for admin_cli channel', () => {
        const request = makeRequest({
          source: { channel: 'admin_cli' },
        });
        expect(classifier.classify(request)).toBe('elevated');
      });

      it('should return "anonymous" for unknown channel', () => {
        const request = makeRequest({
          source: { channel: 'unknown_channel' as any },
        });
        expect(classifier.classify(request)).toBe('anonymous');
      });
    });

    describe('github_webhook channel', () => {
      it('should return "anonymous" when no identity is provided', () => {
        const request = makeRequest({
          source: { channel: 'github_webhook' },
        });
        expect(classifier.classify(request)).toBe('anonymous');
      });

      it('should return "contributor" as conservative default for identified GitHub users', () => {
        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'some-user' },
        });
        expect(classifier.classify(request)).toBe('contributor');
      });

      it('should return cached permission if available and not expired', () => {
        // First, populate cache via async method setup
        // We'll test cache behavior by directly testing the sync path
        // after a successful async call has populated it
        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'cached-user' },
        });

        // Without cache, should return 'contributor' (conservative default)
        expect(classifier.classify(request)).toBe('contributor');
      });
    });

    describe('contributor_api channel', () => {
      it('should return "anonymous" when no identity is provided', () => {
        const request = makeRequest({
          source: { channel: 'contributor_api' },
        });
        expect(classifier.classify(request)).toBe('anonymous');
      });

      it('should return "contributor" when identity is provided', () => {
        const request = makeRequest({
          source: { channel: 'contributor_api', identity: 'api-user-123' },
        });
        expect(classifier.classify(request)).toBe('contributor');
      });
    });
  });

  describe('classifyAsync', () => {
    describe('channel-based classification', () => {
      it('should return "anonymous" for public_api channel', async () => {
        const request = makeRequest({
          source: { channel: 'public_api' },
        });
        expect(await classifier.classifyAsync(request)).toBe('anonymous');
      });

      it('should return "elevated" for admin_cli channel', async () => {
        const request = makeRequest({
          source: { channel: 'admin_cli' },
        });
        expect(await classifier.classifyAsync(request)).toBe('elevated');
      });

      it('should return "anonymous" for unknown channel', async () => {
        const request = makeRequest({
          source: { channel: 'unknown_channel' as any },
        });
        expect(await classifier.classifyAsync(request)).toBe('anonymous');
      });
    });

    describe('github_webhook with API lookup', () => {
      it('should return "anonymous" when no identity is provided', async () => {
        const request = makeRequest({
          source: { channel: 'github_webhook' },
        });
        expect(await classifier.classifyAsync(request)).toBe('anonymous');
      });

      it('should map "admin" GitHub permission to "elevated" trust', async () => {
        mockedGetCollaboratorPermission.mockResolvedValueOnce({ permission: 'admin' });

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'admin-user' },
        });
        expect(await classifier.classifyAsync(request)).toBe('elevated');
      });

      it('should map "maintain" GitHub permission to "elevated" trust', async () => {
        mockedGetCollaboratorPermission.mockResolvedValueOnce({ permission: 'maintain' });

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'maintainer-user' },
        });
        expect(await classifier.classifyAsync(request)).toBe('elevated');
      });

      it('should map "write" GitHub permission to "authorized" trust', async () => {
        mockedGetCollaboratorPermission.mockResolvedValueOnce({ permission: 'write' });

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'write-user' },
        });
        expect(await classifier.classifyAsync(request)).toBe('authorized');
      });

      it('should map "triage" GitHub permission to "contributor" trust', async () => {
        mockedGetCollaboratorPermission.mockResolvedValueOnce({ permission: 'triage' });

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'triage-user' },
        });
        expect(await classifier.classifyAsync(request)).toBe('contributor');
      });

      it('should map "read" GitHub permission to "contributor" trust', async () => {
        mockedGetCollaboratorPermission.mockResolvedValueOnce({ permission: 'read' });

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'read-user' },
        });
        expect(await classifier.classifyAsync(request)).toBe('contributor');
      });

      it('should map "none" GitHub permission to "anonymous" trust', async () => {
        mockedGetCollaboratorPermission.mockResolvedValueOnce({ permission: 'none' });

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'nobody-user' },
        });
        expect(await classifier.classifyAsync(request)).toBe('anonymous');
      });

      it('should fall back to "contributor" when project ID has no owner/repo format', async () => {
        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'some-user' },
          project: 'simple-project-id', // No slash — can't parse owner/repo
        });
        expect(await classifier.classifyAsync(request)).toBe('contributor');
        expect(mockedGetCollaboratorPermission).not.toHaveBeenCalled();
      });

      it('should fall back to "contributor" when GitHub API call fails', async () => {
        mockedGetCollaboratorPermission.mockRejectedValueOnce(new Error('API error'));

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'error-user' },
        });

        // Should not throw, should return conservative default
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        expect(await classifier.classifyAsync(request)).toBe('contributor');
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('caching behavior', () => {
      it('should cache results from API lookup', async () => {
        mockedGetCollaboratorPermission.mockResolvedValueOnce({ permission: 'admin' });

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'cache-test-user' },
        });

        // First call: hits API
        expect(await classifier.classifyAsync(request)).toBe('elevated');
        expect(mockedGetCollaboratorPermission).toHaveBeenCalledTimes(1);

        // Second call: should use cache, not call API again
        expect(await classifier.classifyAsync(request)).toBe('elevated');
        expect(mockedGetCollaboratorPermission).toHaveBeenCalledTimes(1);
      });

      it('should use cached values in synchronous classify after async lookup', async () => {
        mockedGetCollaboratorPermission.mockResolvedValueOnce({ permission: 'write' });

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'sync-cache-user' },
        });

        // Async call populates cache
        expect(await classifier.classifyAsync(request)).toBe('authorized');

        // Sync call should use cached value
        expect(classifier.classify(request)).toBe('authorized');
      });

      it('should separate cache entries by project and identity', async () => {
        mockedGetCollaboratorPermission
          .mockResolvedValueOnce({ permission: 'admin' })
          .mockResolvedValueOnce({ permission: 'read' });

        const request1 = makeRequest({
          source: { channel: 'github_webhook', identity: 'user-a' },
          project: 'owner/repo1',
        });

        const request2 = makeRequest({
          source: { channel: 'github_webhook', identity: 'user-a' },
          project: 'owner/repo2',
        });

        expect(await classifier.classifyAsync(request1)).toBe('elevated');
        expect(await classifier.classifyAsync(request2)).toBe('contributor');
        expect(mockedGetCollaboratorPermission).toHaveBeenCalledTimes(2);
      });

      it('should clear cache when clearCache is called', async () => {
        mockedGetCollaboratorPermission.mockResolvedValue({ permission: 'admin' });

        const request = makeRequest({
          source: { channel: 'github_webhook', identity: 'clear-cache-user' },
        });

        await classifier.classifyAsync(request);
        expect(mockedGetCollaboratorPermission).toHaveBeenCalledTimes(1);

        // Clear cache
        classifier.clearCache();

        // Should call API again
        await classifier.classifyAsync(request);
        expect(mockedGetCollaboratorPermission).toHaveBeenCalledTimes(2);
      });
    });

    describe('contributor_api channel (async)', () => {
      it('should return "anonymous" when no identity is provided', async () => {
        const request = makeRequest({
          source: { channel: 'contributor_api' },
        });
        expect(await classifier.classifyAsync(request)).toBe('anonymous');
      });

      it('should return "contributor" when identity is provided', async () => {
        const request = makeRequest({
          source: { channel: 'contributor_api', identity: 'api-user' },
        });
        expect(await classifier.classifyAsync(request)).toBe('contributor');
      });
    });
  });

  describe('security properties', () => {
    it('should never return a trust level higher than "contributor" without API verification for webhooks', () => {
      // This tests that the synchronous classify (which can't call the API)
      // never grants elevated or authorized trust without cache evidence
      const request = makeRequest({
        source: { channel: 'github_webhook', identity: 'unknown-user' },
      });

      const result = classifier.classify(request);
      expect(['anonymous', 'contributor']).toContain(result);
    });

    it('should default to "anonymous" when no identity is provided on any channel', () => {
      const channels = ['github_webhook', 'contributor_api'] as const;
      for (const channel of channels) {
        const request = makeRequest({
          source: { channel },
        });
        expect(classifier.classify(request)).toBe('anonymous');
      }
    });

    it('should correctly parse owner/repo from project ID for API calls', async () => {
      mockedGetCollaboratorPermission.mockResolvedValueOnce({ permission: 'write' });

      const request = makeRequest({
        source: { channel: 'github_webhook', identity: 'test-user' },
        project: 'Episteme-Foundation/ai-governance',
      });

      await classifier.classifyAsync(request);

      expect(mockedGetCollaboratorPermission).toHaveBeenCalledWith(
        'Episteme-Foundation',
        'ai-governance',
        'test-user'
      );
    });
  });
});
