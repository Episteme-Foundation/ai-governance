import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WikiLandingPage, WikiPage, ProjectConfig } from '../../types';

const execFileAsync = promisify(execFile);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);

/**
 * Loads wiki content from the GitHub Wiki git repository.
 *
 * GitHub Wikis are git repos at: https://github.com/{owner}/{repo}.wiki.git
 * This loader clones/pulls the wiki repo locally and reads markdown files.
 */
export class WikiLoader {
  private static landingPageCache = new Map<
    string,
    { landingPage: WikiLandingPage; cachedAt: Date }
  >();
  private static readonly CACHE_TTL_MS = 1000 * 60 * 15; // 15 minutes
  private static readonly WIKI_DIR = path.join(
    process.cwd(),
    '.cache',
    'wiki'
  );

  /**
   * Derive the wiki git URL from a project's repository URL.
   */
  private static getWikiRepoUrl(project: ProjectConfig): string {
    // e.g. https://github.com/Episteme-Foundation/ai-governance
    //   -> https://github.com/Episteme-Foundation/ai-governance.wiki.git
    const repoUrl = project.repository.replace(/\.git$/, '');
    return `${repoUrl}.wiki.git`;
  }

  /**
   * Get the local directory for the cloned wiki repo.
   */
  private static getLocalWikiDir(project: ProjectConfig): string {
    return path.join(this.WIKI_DIR, project.id);
  }

  /**
   * Ensure the wiki repo is cloned locally. Pulls if it already exists.
   * Returns the local directory path, or null if the wiki is not available.
   */
  static async ensureRepo(project: ProjectConfig): Promise<string | null> {
    const localDir = this.getLocalWikiDir(project);
    const wikiUrl = this.getWikiRepoUrl(project);

    try {
      await mkdir(this.WIKI_DIR, { recursive: true });

      const dirExists = await stat(localDir)
        .then((s) => s.isDirectory())
        .catch(() => false);

      if (dirExists) {
        // Pull latest changes
        try {
          await execFileAsync('git', ['pull', '--ff-only'], {
            cwd: localDir,
            timeout: 15000,
          });
        } catch {
          // Pull failed (e.g. network issue) — use existing checkout
        }
      } else {
        // Clone the wiki repo
        await execFileAsync(
          'git',
          ['clone', '--depth', '1', wikiUrl, localDir],
          { timeout: 30000 }
        );
      }

      return localDir;
    } catch (_err) {
      // Wiki repo may not exist yet (returns 128 for non-existent repos)
      return null;
    }
  }

  /**
   * List all markdown files in the wiki repo.
   */
  private static async listPages(wikiDir: string): Promise<string[]> {
    const entries = await readdir(wikiDir);
    return entries
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
  }

  /**
   * Read a single markdown page from the wiki repo.
   */
  private static async readPage(
    wikiDir: string,
    pagePath: string
  ): Promise<WikiPage | null> {
    const filePath = path.join(wikiDir, `${pagePath}.md`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const fileStat = await stat(filePath);

      // Extract title from first heading or filename
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : pagePath.replace(/-/g, ' ');

      // Use git log to get last modifier
      let modifiedBy = 'unknown';
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['log', '-1', '--format=%an', '--', `${pagePath}.md`],
          { cwd: wikiDir, timeout: 5000 }
        );
        modifiedBy = stdout.trim() || 'unknown';
      } catch {
        // Fall back to 'unknown'
      }

      // First paragraph as summary
      const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
      const summary = lines.length > 0 ? lines[0].trim().slice(0, 200) : '';

      return {
        path: pagePath,
        title,
        content,
        lastModified: fileStat.mtime.toISOString(),
        modifiedBy,
        summary,
      };
    } catch {
      return null;
    }
  }

  /**
   * Load the wiki landing page for a project
   */
  static async loadLandingPage(
    project: ProjectConfig
  ): Promise<WikiLandingPage> {
    const now = new Date();
    const cacheKey = project.id;

    // Check cache
    const cached = this.landingPageCache.get(cacheKey);
    if (
      cached &&
      now.getTime() - cached.cachedAt.getTime() < this.CACHE_TTL_MS
    ) {
      return cached.landingPage;
    }

    const wikiDir = await this.ensureRepo(project);

    if (!wikiDir) {
      // Wiki not available — return a placeholder
      const placeholder: WikiLandingPage = {
        overview: `# ${project.name} Wiki\n\nThe GitHub Wiki has not been initialized yet. Create a Home page at the repository wiki tab to get started.`,
        navigation: [],
        keyPages: [],
      };
      this.landingPageCache.set(cacheKey, {
        landingPage: placeholder,
        cachedAt: now,
      });
      return placeholder;
    }

    const pageNames = await this.listPages(wikiDir);

    // Read the Home page for the overview
    const homePage = await this.readPage(wikiDir, 'Home');
    const overview = homePage
      ? homePage.content
      : `# ${project.name} Wiki\n\n${pageNames.length} pages available.`;

    // Build navigation from available pages
    const pages = pageNames
      .filter((p) => p !== 'Home')
      .map((p) => ({
        title: p.replace(/-/g, ' '),
        path: p,
      }));

    const navigation =
      pages.length > 0
        ? [
            {
              title: 'Pages',
              pages: [{ title: 'Home', path: 'Home' }, ...pages],
            },
          ]
        : [{ title: 'Pages', pages: [{ title: 'Home', path: 'Home' }] }];

    // Key pages: Home + any Roadmap or Architecture pages
    const keyPages = pageNames
      .filter((p) => /^(Home|Roadmap|Architecture)/i.test(p))
      .map((p) => ({
        title: p.replace(/-/g, ' '),
        path: p,
        summary: '',
      }));

    const landingPage: WikiLandingPage = { overview, navigation, keyPages };
    this.landingPageCache.set(cacheKey, { landingPage, cachedAt: now });
    return landingPage;
  }

  /**
   * Load a specific wiki page
   */
  static async loadPage(
    project: ProjectConfig,
    pagePath: string
  ): Promise<WikiPage | null> {
    const wikiDir = await this.ensureRepo(project);
    if (!wikiDir) return null;
    return this.readPage(wikiDir, pagePath);
  }

  /**
   * Search wiki content by matching query terms against page titles and content.
   */
  static async search(
    project: ProjectConfig,
    query: string
  ): Promise<WikiPage[]> {
    const wikiDir = await this.ensureRepo(project);
    if (!wikiDir) return [];

    const pageNames = await this.listPages(wikiDir);
    const results: WikiPage[] = [];
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(Boolean);

    for (const pageName of pageNames) {
      const page = await this.readPage(wikiDir, pageName);
      if (!page) continue;

      const textLower = `${page.title} ${page.content}`.toLowerCase();
      const matches = queryTerms.some((term) => textLower.includes(term));
      if (matches) {
        results.push(page);
      }
    }

    return results;
  }

  /**
   * Write a page to the wiki repo and push to GitHub.
   */
  static async writePage(
    project: ProjectConfig,
    pagePath: string,
    content: string,
    commitMessage: string
  ): Promise<boolean> {
    const wikiDir = await this.ensureRepo(project);
    if (!wikiDir) return false;

    const filePath = path.join(wikiDir, `${pagePath}.md`);
    try {
      await writeFile(filePath, content, 'utf-8');
      await execFileAsync('git', ['add', `${pagePath}.md`], {
        cwd: wikiDir,
        timeout: 5000,
      });
      await execFileAsync(
        'git',
        ['commit', '-m', commitMessage],
        { cwd: wikiDir, timeout: 5000 }
      );
      await execFileAsync('git', ['push'], {
        cwd: wikiDir,
        timeout: 15000,
      });
      // Invalidate cache
      this.clearCache(project.id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear the cache
   */
  static clearCache(projectId?: string): void {
    if (projectId) {
      this.landingPageCache.delete(projectId);
    } else {
      this.landingPageCache.clear();
    }
  }
}
