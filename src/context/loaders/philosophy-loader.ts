import { readFileSync } from 'fs';
import { join } from 'path';
import type { ProjectRegistry } from '../../config/project-registry';

/**
 * Loads and caches the PHILOSOPHY.md content
 */
export class PhilosophyLoader {
  private static cachedContent: string | null = null;
  private static cachedAt: Date | null = null;
  private static readonly CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

  /**
   * Load the philosophy document content from local filesystem
   * @param projectRoot - Root directory of the project
   * @returns Philosophy markdown content
   */
  static load(projectRoot: string = process.cwd()): string {
    const now = new Date();

    // Return cached content if still valid
    if (
      this.cachedContent &&
      this.cachedAt &&
      now.getTime() - this.cachedAt.getTime() < this.CACHE_TTL_MS
    ) {
      return this.cachedContent;
    }

    // Load from file
    const philosophyPath = join(projectRoot, 'PHILOSOPHY.md');
    this.cachedContent = readFileSync(philosophyPath, 'utf-8');
    this.cachedAt = now;

    return this.cachedContent;
  }

  /**
   * Load philosophy content for a project, supporting remote projects
   *
   * For remote projects: reads from DB (synced from .governance/PHILOSOPHY.md)
   * For local projects or when DB content is null: falls back to framework default
   *
   * @param projectId - Project identifier
   * @param registry - ProjectRegistry for DB access
   * @param projectRoot - Fallback filesystem root
   * @returns Philosophy markdown content
   */
  static async loadForProject(
    projectId: string,
    registry: ProjectRegistry,
    projectRoot: string = process.cwd()
  ): Promise<string> {
    // Check DB for project-specific philosophy
    const dbContent = await registry.getPhilosophyContent(projectId);
    if (dbContent) {
      return dbContent;
    }

    // Fall back to framework default (local filesystem)
    return this.load(projectRoot);
  }

  /**
   * Clear the cache (useful for testing)
   */
  static clearCache(): void {
    this.cachedContent = null;
    this.cachedAt = null;
  }
}
