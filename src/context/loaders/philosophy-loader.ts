import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Loads and caches the PHILOSOPHY.md content
 */
export class PhilosophyLoader {
  private static cachedContent: string | null = null;
  private static cachedAt: Date | null = null;
  private static readonly CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

  /**
   * Load the philosophy document content
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
   * Clear the cache (useful for testing)
   */
  static clearCache(): void {
    this.cachedContent = null;
    this.cachedAt = null;
  }
}
