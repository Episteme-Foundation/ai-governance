import {
  PhilosophyLoader,
  ConstitutionLoader,
  WikiLoader,
  DecisionLoader,
} from './loaders';
import { EmbeddingsService } from './embeddings';
import { GovernanceRequest, RoleDefinition, ProjectConfig } from '../types';
import {
  ConversationThreadRepository,
  Participant,
} from '../db/repositories/conversation-thread-repository';
import type { ProjectRegistry } from '../config/project-registry';

/**
 * Builds system prompts for governance agents
 */
export class SystemPromptBuilder {
  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly decisionLoader: DecisionLoader,
    private readonly projectRoot: string = process.cwd(),
    private readonly conversationThreadRepo?: ConversationThreadRepository,
    private readonly registry?: ProjectRegistry
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
    // For remote projects, load from DB; for local projects, load from filesystem
    const philosophy = this.registry
      ? await PhilosophyLoader.loadForProject(project.id, this.registry, this.projectRoot)
      : PhilosophyLoader.load(this.projectRoot);
    sections.push('# Foundational Principles\n\n' + philosophy);

    // 2. Project Constitution (specific governance structure)
    const constitution = this.registry
      ? await ConstitutionLoader.loadForProject(project, this.registry, this.projectRoot)
      : ConstitutionLoader.load(project, this.projectRoot);
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

    // 6. Active Work Context (awareness of ongoing work)
    const activeWorkContext = await this.buildActiveWorkContext(
      project.id,
      role.name
    );
    if (activeWorkContext) {
      sections.push('\n\n# Active Work\n\n' + activeWorkContext);
    }

    // 7. Request Context (what they're being asked to do)
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

  /**
   * Build context about active work for this role
   * Provides awareness of ongoing conversations and work items
   */
  private async buildActiveWorkContext(
    projectId: string,
    roleName: string
  ): Promise<string | null> {
    if (!this.conversationThreadRepo) {
      return null;
    }

    const participant: Participant = { type: 'role', id: roleName };
    const activeConversations =
      await this.conversationThreadRepo.getActiveForParticipant(
        projectId,
        participant
      );

    if (activeConversations.length === 0) {
      return null;
    }

    const lines: string[] = [];
    lines.push(
      `You have ${activeConversations.length} active conversation(s) that may be relevant:\n`
    );

    for (const conv of activeConversations.slice(0, 5)) {
      // Limit to 5 for context size
      const otherParticipants = conv.participants
        .filter((p) => !(p.type === 'role' && p.id === roleName))
        .map((p) => p.id)
        .join(', ');

      lines.push(`- **${conv.id}** with ${otherParticipants}`);
      if (conv.topic) {
        lines.push(`  Topic: ${conv.topic}`);
      }
      lines.push(`  Updated: ${conv.updatedAt}`);
    }

    if (activeConversations.length > 5) {
      lines.push(
        `\n...and ${activeConversations.length - 5} more. Use list_conversations() to see all.`
      );
    }

    lines.push(
      '\nUse get_conversation() to review any conversation before responding to related matters.'
    );

    return lines.join('\n');
  }
}
