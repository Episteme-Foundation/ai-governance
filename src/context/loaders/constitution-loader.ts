import { readFileSync } from 'fs';
import { join } from 'path';
import { ProjectConfig } from '../../types';
import type { ProjectRegistry } from '../../config/project-registry';

/**
 * Loads project constitutions
 */
export class ConstitutionLoader {
  private static cache = new Map<string, { content: string; cachedAt: Date }>();
  private static readonly CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

  /**
   * Load a project's constitution from local filesystem
   * @param project - Project configuration
   * @param projectRoot - Root directory of the project
   * @returns Constitution markdown content
   */
  static load(project: ProjectConfig, projectRoot: string = process.cwd()): string {
    const now = new Date();
    const cacheKey = `${project.id}:${project.constitutionPath}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && now.getTime() - cached.cachedAt.getTime() < this.CACHE_TTL_MS) {
      return cached.content;
    }

    // Load from file
    const constitutionPath = join(projectRoot, project.constitutionPath);
    const content = readFileSync(constitutionPath, 'utf-8');

    // Cache it
    this.cache.set(cacheKey, { content, cachedAt: now });

    return content;
  }

  /**
   * Load constitution content for a project, supporting remote projects
   *
   * For remote projects: reads from DB (synced from .governance/CONSTITUTION.md)
   * For local projects: falls back to filesystem loading
   *
   * @param project - Project configuration
   * @param registry - ProjectRegistry for DB access
   * @param projectRoot - Fallback filesystem root
   * @returns Constitution markdown content
   */
  static async loadForProject(
    project: ProjectConfig,
    registry: ProjectRegistry,
    projectRoot: string = process.cwd()
  ): Promise<string> {
    // Check DB for project-specific constitution
    const dbContent = await registry.getConstitutionContent(project.id);
    if (dbContent) {
      return dbContent;
    }

    // Fall back to filesystem loading
    return this.load(project, projectRoot);
  }

  /**
   * Clear the cache (useful for testing)
   */
  static clearCache(projectId?: string): void {
    if (projectId) {
      // Clear specific project
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${projectId}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all
      this.cache.clear();
    }
  }
}
