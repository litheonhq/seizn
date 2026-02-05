/**
 * Context Service (Zep/Memobase Style)
 *
 * Provides ready-to-inject context strings for LLM prompts.
 * Supports multiple formats and tier-based retrieval.
 *
 * @module spring/memory-v4/context-service
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSearchServiceV3 } from './search-service';
import { createTierManagerService, type MemoryTier } from './tier-manager';
import type { SearchV3Result } from './types';

// =============================================================================
// Types
// =============================================================================

export type ContextFormat = 'brief' | 'detailed' | 'extended' | 'custom';

export interface ContextOptions {
  /** Output format preset */
  format?: ContextFormat;
  /** Maximum tokens for the context (default: varies by format) */
  maxTokens?: number;
  /** Include user profile summary */
  includeProfile?: boolean;
  /** Include recent conversation messages */
  includeRecentMessages?: boolean;
  /** Number of recent messages to include */
  recentMessageCount?: number;
  /** Include facts/memories */
  includeFacts?: boolean;
  /** Include graph-based relationships */
  includeGraph?: boolean;
  /** Tier retrieval strategy */
  tierStrategy?: 'hot_first' | 'balanced' | 'comprehensive';
  /** Custom tier budgets (percentages) */
  tierBudgets?: {
    hot?: number;
    warm?: number;
    cold?: number;
  };
  /** Query for relevance filtering (optional) */
  query?: string;
  /** Memory type filter */
  types?: string[];
  /** Tag filter */
  tags?: string[];
  /** Category filter */
  categories?: string[];
  /** Custom template for formatting */
  template?: string;
}

export interface ContextResponse {
  /** Formatted context string ready for prompt injection */
  contextString: string;
  /** Raw facts included */
  facts: Array<{
    id: string;
    content: string;
    type: string;
    similarity?: number;
    tier?: MemoryTier;
  }>;
  /** User profile summary */
  profile?: {
    summary: string;
    slots: Record<string, string>;
  };
  /** Recent messages */
  recentMessages?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  /** Token count estimate */
  tokenCount: number;
  /** Processing metadata */
  metadata: {
    format: ContextFormat;
    factsIncluded: number;
    tierDistribution?: Record<MemoryTier, number>;
    processingMs: number;
  };
}

interface MessageRecord {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

// =============================================================================
// Constants
// =============================================================================

const FORMAT_PRESETS: Record<ContextFormat, { maxTokens: number; description: string }> = {
  brief: { maxTokens: 500, description: 'Essential facts only' },
  detailed: { maxTokens: 1500, description: 'Comprehensive context' },
  extended: { maxTokens: 3000, description: 'Full context with graph' },
  custom: { maxTokens: 2000, description: 'Custom configuration' },
};

const CHARS_PER_TOKEN = 4; // Approximate for English

// =============================================================================
// Context Service
// =============================================================================

export class ContextService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get formatted context string (Zep/Memobase style)
   *
   * Returns a ready-to-inject context string along with raw data.
   */
  async getContext(userId: string, options: ContextOptions = {}): Promise<ContextResponse> {
    const startTime = Date.now();

    const format = options.format ?? 'detailed';
    const maxTokens = options.maxTokens ?? FORMAT_PRESETS[format].maxTokens;

    // Determine what to include based on format
    const includeProfile = options.includeProfile ?? (format !== 'brief');
    const includeFacts = options.includeFacts ?? true;
    const includeGraph = options.includeGraph ?? (format === 'extended');
    const includeRecentMessages = options.includeRecentMessages ?? (format !== 'brief');

    // Allocate token budgets
    const budgets = this.allocateTokenBudgets(maxTokens, {
      profile: includeProfile,
      facts: includeFacts,
      messages: includeRecentMessages,
      graph: includeGraph,
    });

    // Gather context components in parallel
    const [profile, facts, recentMessages] = await Promise.all([
      includeProfile ? this.getProfileSummary(userId, budgets.profile) : null,
      includeFacts
        ? this.getRelevantFacts(userId, {
            maxTokens: budgets.facts,
            query: options.query,
            tierStrategy: options.tierStrategy,
            tierBudgets: options.tierBudgets,
            types: options.types,
            tags: options.tags,
            categories: options.categories,
            includeGraph,
          })
        : { facts: [], tierDistribution: undefined },
      includeRecentMessages
        ? this.getRecentMessages(userId, options.recentMessageCount ?? 5, budgets.messages)
        : [],
    ]);

    // Format the context string
    const messages = recentMessages ?? [];
    const contextString = options.template
      ? this.formatWithTemplate(options.template, { profile, facts: facts.facts, recentMessages: messages })
      : this.formatContext(format, { profile, facts: facts.facts, recentMessages: messages });

    const tokenCount = this.estimateTokens(contextString);

    return {
      contextString,
      facts: facts.facts,
      profile: profile ?? undefined,
      recentMessages: messages.length > 0 ? messages : undefined,
      tokenCount,
      metadata: {
        format,
        factsIncluded: facts.facts.length,
        tierDistribution: facts.tierDistribution,
        processingMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Quick context getter - returns just the context string
   */
  async getContextString(userId: string, format: ContextFormat = 'detailed'): Promise<string> {
    const response = await this.getContext(userId, { format });
    return response.contextString;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Allocate token budgets for different components
   */
  private allocateTokenBudgets(
    total: number,
    include: { profile: boolean; facts: boolean; messages: boolean; graph: boolean }
  ): { profile: number; facts: number; messages: number; graph: number } {
    const components = Object.values(include).filter(Boolean).length;
    if (components === 0) return { profile: 0, facts: total, messages: 0, graph: 0 };

    // Base allocations (percentages)
    const allocations = {
      profile: include.profile ? 15 : 0,
      facts: include.facts ? 50 : 0,
      messages: include.messages ? 25 : 0,
      graph: include.graph ? 10 : 0,
    };

    const totalPercent = Object.values(allocations).reduce((a, b) => a + b, 0);

    return {
      profile: Math.round((allocations.profile / totalPercent) * total),
      facts: Math.round((allocations.facts / totalPercent) * total),
      messages: Math.round((allocations.messages / totalPercent) * total),
      graph: Math.round((allocations.graph / totalPercent) * total),
    };
  }

  /**
   * Get user profile summary
   */
  private async getProfileSummary(
    userId: string,
    maxTokens: number
  ): Promise<{ summary: string; slots: Record<string, string> } | null> {
    // Get from memory_profiles table
    const { data: profile } = await this.supabase
      .from('memory_profiles')
      .select('profile_card, slot_snapshot')
      .eq('user_id', userId)
      .single();

    if (!profile) {
      return null;
    }

    let summary = profile.profile_card || '';

    // Truncate if needed
    const maxChars = maxTokens * CHARS_PER_TOKEN;
    if (summary.length > maxChars) {
      summary = summary.slice(0, maxChars - 3) + '...';
    }

    return {
      summary,
      slots: profile.slot_snapshot || {},
    };
  }

  /**
   * Get relevant facts/memories
   */
  private async getRelevantFacts(
    userId: string,
    options: {
      maxTokens: number;
      query?: string;
      tierStrategy?: 'hot_first' | 'balanced' | 'comprehensive';
      tierBudgets?: { hot?: number; warm?: number; cold?: number };
      types?: string[];
      tags?: string[];
      categories?: string[];
      includeGraph?: boolean;
    }
  ): Promise<{
    facts: ContextResponse['facts'];
    tierDistribution?: Record<MemoryTier, number>;
  }> {
    const searchService = createSearchServiceV3(this.supabase);
    const tierManager = createTierManagerService(this.supabase);

    // Calculate how many facts we can fit
    const avgFactTokens = 50; // Rough estimate
    const maxFacts = Math.ceil(options.maxTokens / avgFactTokens);

    // Search for relevant facts
    const searchResult = await searchService.search(userId, {
      query: options.query || '*',
      topK: maxFacts * 2, // Oversample for tier filtering
      filters: {
        types: options.types,
        tags: options.tags,
        categories: options.categories,
        statuses: ['active'],
      },
      mode: options.query ? 'hybrid' : 'semantic',
      rerank: !!options.query,
    });

    // Apply tier strategy
    const tierStrategy = options.tierStrategy ?? 'balanced';
    let results = searchResult.results;

    if (tierStrategy !== 'comprehensive') {
      // Get tier info for each result
      const resultsWithTiers = await Promise.all(
        results.map(async (r: SearchV3Result) => {
          const tier = await tierManager.calculateTier(r.id, userId);
          return { ...r, tier };
        })
      );

      // Apply tier budgets
      const budgets = options.tierBudgets ??
        (tierStrategy === 'hot_first'
          ? { hot: 60, warm: 30, cold: 10 }
          : { hot: 40, warm: 40, cold: 20 });

      const hot = resultsWithTiers.filter((r) => r.tier === 'hot');
      const warm = resultsWithTiers.filter((r) => r.tier === 'warm');
      const cold = resultsWithTiers.filter((r) => r.tier === 'cold' || r.tier === 'frozen');

      const hotCount = Math.ceil(maxFacts * (budgets.hot ?? 40) / 100);
      const warmCount = Math.ceil(maxFacts * (budgets.warm ?? 40) / 100);
      const coldCount = maxFacts - hotCount - warmCount;

      results = [
        ...hot.slice(0, hotCount),
        ...warm.slice(0, warmCount),
        ...cold.slice(0, coldCount),
      ];

      // Calculate tier distribution
      const tierDistribution: Record<MemoryTier, number> = {
        hot: results.filter((r: SearchV3Result & { tier?: MemoryTier }) => r.tier === 'hot').length,
        warm: results.filter((r: SearchV3Result & { tier?: MemoryTier }) => r.tier === 'warm').length,
        cold: results.filter((r: SearchV3Result & { tier?: MemoryTier }) => r.tier === 'cold').length,
        frozen: results.filter((r: SearchV3Result & { tier?: MemoryTier }) => r.tier === 'frozen').length,
      };

      return {
        facts: results.slice(0, maxFacts).map((r: SearchV3Result & { tier?: MemoryTier }) => ({
          id: r.id,
          content: r.content,
          type: r.type,
          similarity: r.combinedScore,
          tier: r.tier,
        })),
        tierDistribution,
      };
    }

    return {
      facts: results.slice(0, maxFacts).map((r: SearchV3Result) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        similarity: r.combinedScore,
      })),
    };
  }

  /**
   * Get recent conversation messages
   */
  private async getRecentMessages(
    userId: string,
    count: number,
    maxTokens: number
  ): Promise<ContextResponse['recentMessages']> {
    // Get from conversation_messages table
    const { data: messages } = await this.supabase
      .from('conversation_messages')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(count);

    if (!messages || messages.length === 0) {
      return [];
    }

    // Truncate to fit token budget
    const maxChars = maxTokens * CHARS_PER_TOKEN;
    let totalChars = 0;
    const result: NonNullable<ContextResponse['recentMessages']> = [];

    for (const msg of messages.reverse() as MessageRecord[]) {
      const msgChars = msg.content.length;
      if (totalChars + msgChars > maxChars) break;

      result.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.created_at,
      });
      totalChars += msgChars;
    }

    return result;
  }

  /**
   * Format context string based on preset format
   */
  private formatContext(
    format: ContextFormat,
    data: {
      profile: { summary: string; slots: Record<string, string> } | null;
      facts: ContextResponse['facts'];
      recentMessages: NonNullable<ContextResponse['recentMessages']>;
    }
  ): string {
    switch (format) {
      case 'brief':
        return this.formatBrief(data);
      case 'detailed':
        return this.formatDetailed(data);
      case 'extended':
        return this.formatExtended(data);
      default:
        return this.formatDetailed(data);
    }
  }

  /**
   * Brief format (~500 tokens)
   */
  private formatBrief(data: {
    profile: { summary: string; slots: Record<string, string> } | null;
    facts: ContextResponse['facts'];
    recentMessages: NonNullable<ContextResponse['recentMessages']>;
  }): string {
    const lines: string[] = [];

    // Key facts only
    if (data.facts.length > 0) {
      lines.push('Key Facts:');
      for (const fact of data.facts.slice(0, 10)) {
        lines.push(`- ${fact.content}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Detailed format (~1500 tokens)
   */
  private formatDetailed(data: {
    profile: { summary: string; slots: Record<string, string> } | null;
    facts: ContextResponse['facts'];
    recentMessages: NonNullable<ContextResponse['recentMessages']>;
  }): string {
    const sections: string[] = [];

    // Profile section
    if (data.profile) {
      sections.push('<user_profile>');
      sections.push(data.profile.summary);

      const slots = Object.entries(data.profile.slots);
      if (slots.length > 0) {
        sections.push('\nKnown Facts:');
        for (const [key, value] of slots.slice(0, 10)) {
          sections.push(`- ${key}: ${value}`);
        }
      }
      sections.push('</user_profile>');
    }

    // Facts section
    if (data.facts.length > 0) {
      sections.push('\n<memories>');

      // Group by type
      const byType = new Map<string, typeof data.facts>();
      for (const fact of data.facts) {
        if (!byType.has(fact.type)) {
          byType.set(fact.type, []);
        }
        byType.get(fact.type)!.push(fact);
      }

      for (const [type, facts] of byType) {
        sections.push(`\n[${type.toUpperCase()}]`);
        for (const fact of facts) {
          sections.push(`- ${fact.content}`);
        }
      }
      sections.push('</memories>');
    }

    // Recent messages section
    if (data.recentMessages.length > 0) {
      sections.push('\n<recent_context>');
      for (const msg of data.recentMessages) {
        sections.push(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`);
      }
      sections.push('</recent_context>');
    }

    return sections.join('\n');
  }

  /**
   * Extended format (~3000 tokens)
   */
  private formatExtended(data: {
    profile: { summary: string; slots: Record<string, string> } | null;
    facts: ContextResponse['facts'];
    recentMessages: NonNullable<ContextResponse['recentMessages']>;
  }): string {
    const sections: string[] = [];

    // Full profile section
    if (data.profile) {
      sections.push('# User Profile\n');
      sections.push(data.profile.summary);

      const slots = Object.entries(data.profile.slots);
      if (slots.length > 0) {
        sections.push('\n## Known Facts\n');
        for (const [key, value] of slots) {
          sections.push(`- **${key}**: ${value}`);
        }
      }
    }

    // Full memories section with metadata
    if (data.facts.length > 0) {
      sections.push('\n# Relevant Memories\n');

      // Group by type
      const byType = new Map<string, typeof data.facts>();
      for (const fact of data.facts) {
        if (!byType.has(fact.type)) {
          byType.set(fact.type, []);
        }
        byType.get(fact.type)!.push(fact);
      }

      for (const [type, facts] of byType) {
        sections.push(`\n## ${this.formatTypeName(type)}\n`);
        for (const fact of facts) {
          let line = `- ${fact.content}`;
          if (fact.similarity !== undefined) {
            line += ` _(relevance: ${Math.round(fact.similarity * 100)}%)_`;
          }
          if (fact.tier) {
            line += ` [${fact.tier}]`;
          }
          sections.push(line);
        }
      }
    }

    // Recent conversation
    if (data.recentMessages.length > 0) {
      sections.push('\n# Recent Conversation\n');
      for (const msg of data.recentMessages) {
        sections.push(`**${msg.role === 'user' ? 'User' : 'Assistant'}**: ${msg.content}\n`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Format with custom template
   */
  private formatWithTemplate(
    template: string,
    data: {
      profile: { summary: string; slots: Record<string, string> } | null;
      facts: ContextResponse['facts'];
      recentMessages: NonNullable<ContextResponse['recentMessages']>;
    }
  ): string {
    let result = template;

    // Replace template variables
    result = result.replace('{{profile}}', data.profile?.summary ?? '');
    result = result.replace(
      '{{slots}}',
      data.profile
        ? Object.entries(data.profile.slots)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        : ''
    );
    result = result.replace(
      '{{facts}}',
      data.facts.map((f) => `- ${f.content}`).join('\n')
    );
    result = result.replace(
      '{{messages}}',
      data.recentMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')
    );

    return result;
  }

  /**
   * Format type name for display
   */
  private formatTypeName(type: string): string {
    const names: Record<string, string> = {
      fact: 'Facts',
      preference: 'Preferences',
      instruction: 'Instructions',
      episode: 'Episodes',
      procedure: 'Procedures',
      relationship: 'Relationships',
    };
    return names[type] || type.charAt(0).toUpperCase() + type.slice(1);
  }

  /**
   * Estimate token count
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createContextService(supabase: SupabaseClient): ContextService {
  return new ContextService(supabase);
}
