import { DecisionRepository } from '../../db/repositories/decision-repository';
import { Decision } from '../../types';

/**
 * Loads relevant past decisions for context
 */
export class DecisionLoader {
  constructor(private readonly decisionRepo: DecisionRepository) {}

  /**
   * Find decisions relevant to the current request
   *
   * @param projectId - Project ID
   * @param requestIntent - Description of what the agent is trying to do
   * @param embedding - Vector embedding of the request intent
   * @param limit - Maximum number of decisions to return
   * @returns Array of relevant decisions
   */
  async loadRelevant(
    projectId: string,
    requestIntent: string,
    embedding: number[],
    limit: number = 5
  ): Promise<Decision[]> {
    // Use semantic search to find similar past decisions
    const results = await this.decisionRepo.semanticSearch(
      projectId,
      embedding,
      limit,
      0.7 // similarity threshold
    );

    return results.map((r) => r.decision);
  }

  /**
   * Load a specific decision by ID
   *
   * @param decisionId - Decision ID
   * @returns Decision or null if not found
   */
  async loadById(decisionId: string): Promise<Decision | null> {
    return this.decisionRepo.getById(decisionId);
  }

  /**
   * Load recent decisions for a project
   *
   * @param projectId - Project ID
   * @param limit - Maximum number to return
   * @returns Recent decisions
   */
  async loadRecent(projectId: string, limit: number = 10): Promise<Decision[]> {
    return this.decisionRepo.getRecent(projectId, limit);
  }
}
