import { readFileSync } from 'fs';
import { join } from 'path';
import { ProjectConfig } from '../../types';

/**
 * Loads project constitutions
 */
export class ConstitutionLoader {
  private static cache = new Map<string, { content: string; cachedAt: Date }>();
  private static readonly CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

  /**
   * Load a project's constitution
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
