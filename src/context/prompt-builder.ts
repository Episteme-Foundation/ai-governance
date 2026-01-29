import {
  PhilosophyLoader,
  ConstitutionLoader,
  WikiLoader,
  DecisionLoader,
} from './loaders';
import { EmbeddingsService } from './embeddings';
import { GovernanceRequest, RoleDefinition, ProjectConfig } from '../types';

/**
 * Builds system prompts for governance agents
 */
export class SystemPromptBuilder {
  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly decisionLoader: DecisionLoader,
    private readonly projectRoot: string = process.cwd()
  ) {}

  /**
   * Build a complete system prompt for an agent
   *
   * @param project - Project configuration
   * @param role - Role the agent is fulfilling
   * @param request - Incoming governance request
   * @returns Complete system prompt
   */
  async build(
    project: ProjectConfig,
    role: RoleDefinition,
    request: GovernanceRequest
  ): Promise<string> {
    const sections: string[] = [];

    // 1. Philosophy (foundational principles)
    const philosophy = PhilosophyLoader.load(this.projectRoot);
    sections.push('# Foundational Principles\n\n' + philosophy);

    // 2. Project Constitution (specific governance structure)
    const constitution = ConstitutionLoader.load(project, this.projectRoot);
    sections.push('\n\n# Project Constitution\n\n' + constitution);

    // 3. Wiki Landing Page (project knowledge)
    const wikiLanding = await WikiLoader.loadLandingPage(project);
    sections.push('\n\n# Project Wiki\n\n' + wikiLanding.overview);

    if (wikiLanding.keyPages.length > 0) {
      sections.push('\n\n## Key Pages');
      for (const page of wikiLanding.keyPages) {
        sections.push(`- [${page.title}](${page.path}): ${page.summary}`);
      }
    }

    // 4. Relevant Past Decisions (semantic search for precedent)
    if (request.intent) {
      const embedding = await this.embeddingsService.embed(request.intent);
      const relevantDecisions = await this.decisionLoader.loadRelevant(
        project.id,
        request.intent,
        embedding,
        5 // top 5 most relevant
      );

      if (relevantDecisions.length > 0) {
        sections.push('\n\n# Relevant Past Decisions\n');
        sections.push(
          'These past decisions may provide relevant precedent for your current task:\n'
        );

        for (const decision of relevantDecisions) {
          sections.push(`\n## Decision #${decision.decisionNumber}: ${decision.title}`);
          sections.push(`**Date:** ${decision.date}`);
          sections.push(`**Decision:** ${decision.decision}`);
          sections.push(`**Reasoning:** ${decision.reasoning}`);
        }
      }
    }

    // 5. Role-Specific Instructions
    sections.push('\n\n# Your Role\n\n');
    sections.push(`**Role:** ${role.name}\n`);
    sections.push(`**Purpose:** ${role.purpose}\n\n`);
    sections.push('## Instructions\n\n' + role.instructions);

    if (role.constraints && role.constraints.length > 0) {
      sections.push('\n\n## Constraints\n');
      for (const constraint of role.constraints) {
        sections.push(
          `- **${constraint.type}:** ${constraint.description}${constraint.enforcement === 'hard' ? ' (HARD - will be blocked)' : ' (SOFT - please follow)'}`
        );
      }
    }

    // 6. Request Context (what they're being asked to do)
    sections.push('\n\n# Current Request\n\n');
    sections.push(`**Trust Level:** ${request.trust}\n`);
    sections.push(`**Source:** ${request.source.channel}\n`);
    if (request.source.identity) {
      sections.push(`**Identity:** ${request.source.identity}\n`);
    }
    sections.push(`**Intent:** ${request.intent}\n`);

    // Join all sections
    return sections.join('\n');
  }
}
