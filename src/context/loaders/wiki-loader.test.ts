import { WikiLoader } from './wiki-loader';
import { ProjectConfig } from '../../types';
import * as fs from 'node:fs';

// Minimal project config for testing
const testProject: ProjectConfig = {
  id: 'test-wiki-project',
  name: 'Test Wiki Project',
  repository: 'https://github.com/Episteme-Foundation/ai-governance',
  constitutionPath: 'CONSTITUTION.md',
  project: {
    id: 'test-wiki-project',
    name: 'Test Wiki Project',
    repository: 'https://github.com/Episteme-Foundation/ai-governance',
    constitution: 'CONSTITUTION.md',
  },
  oversight: {
    contacts: [],
    escalation_threshold: {
      overturned_challenges: true,
      constitutional_amendments: true,
      custom_rules: [],
    },
  },
  limits: {
    anonymous: { requests_per_hour: 10 },
    contributor: { requests_per_hour: 100 },
    authorized: { requests_per_hour: 0 },
  },
  roles: [],
  trust: { github_roles: {}, api_keys: [] },
  mcp_servers: [],
};

describe('WikiLoader', () => {
  beforeEach(() => {
    WikiLoader.clearCache();
  });

  describe('ensureRepo', () => {
    it('should clone or pull the wiki repo and return a directory', async () => {
      const dir = await WikiLoader.ensureRepo(testProject);
      // The repo exists so we should get a directory back
      expect(dir).not.toBeNull();
      expect(typeof dir).toBe('string');
      if (dir) {
        expect(fs.existsSync(dir)).toBe(true);
        // Should contain .md files
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
        expect(files.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('loadPage', () => {
    it('should load the Home page from the wiki', async () => {
      const page = await WikiLoader.loadPage(testProject, 'Home');
      expect(page).not.toBeNull();
      if (page) {
        expect(page.path).toBe('Home');
        expect(page.content.length).toBeGreaterThan(0);
        expect(page.title).toBeTruthy();
      }
    }, 30000);

    it('should return null for a non-existent page', async () => {
      const page = await WikiLoader.loadPage(
        testProject,
        'This-Page-Does-Not-Exist'
      );
      expect(page).toBeNull();
    }, 30000);
  });

  describe('search', () => {
    it('should find pages matching a query', async () => {
      const results = await WikiLoader.search(testProject, 'governance');
      expect(Array.isArray(results)).toBe(true);
      // The Home page mentions "governance"
      expect(results.length).toBeGreaterThan(0);
    }, 30000);

    it('should return empty for non-matching query', async () => {
      const results = await WikiLoader.search(
        testProject,
        'xyznonexistentterm123'
      );
      expect(results).toEqual([]);
    }, 30000);
  });

  describe('loadLandingPage', () => {
    it('should return a landing page with overview and navigation', async () => {
      const landing = await WikiLoader.loadLandingPage(testProject);
      expect(landing).toBeDefined();
      expect(landing.overview.length).toBeGreaterThan(0);
      expect(Array.isArray(landing.navigation)).toBe(true);
      expect(landing.navigation.length).toBeGreaterThan(0);
    }, 30000);

    it('should cache results on second call', async () => {
      const first = await WikiLoader.loadLandingPage(testProject);
      const second = await WikiLoader.loadLandingPage(testProject);
      // Should be the same object reference from cache
      expect(first).toBe(second);
    }, 30000);
  });
});
