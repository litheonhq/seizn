/**
 * Community Summary Service
 *
 * Generates LLM-based summaries for graph communities.
 * Part of GraphRAG hierarchical summarization system.
 *
 * @module graph-rag/community/summary
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { computeEmbedding } from '@/lib/embeddings';
import type { Community } from './detection';

// =============================================================================
// Types
// =============================================================================

export interface CommunitySummary {
  communityId: string;
  summary: string;
  keyEntities: string[];
  keyTopics: string[];
  keyRelationships: string[];
  embedding: number[];
}

export interface SummaryConfig {
  /** LLM model to use */
  model: 'haiku' | 'sonnet';
  /** Maximum entities to include in summary prompt */
  maxEntities: number;
  /** Maximum relationships to include */
  maxRelationships: number;
  /** Target summary length (words) */
  targetLength: number;
  /** Force regeneration even if exists */
  forceRegenerate: boolean;
}

export interface SearchResult {
  community: Community;
  summary: string;
  similarity: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: SummaryConfig = {
  model: 'haiku',
  maxEntities: 20,
  maxRelationships: 30,
  targetLength: 150,
  forceRegenerate: false,
};

const SUMMARY_PROMPT = `You are a knowledge graph summarizer. Create a concise summary of this community of entities.

## Community Information
{content}

## Output Format
Return a valid JSON object:
{
  "summary": "A concise description of what this community represents and its main themes (2-4 sentences)",
  "keyTopics": ["topic1", "topic2", "topic3"], // 3-5 main topics
  "keyRelationships": ["Entity A relates_to Entity B because..."] // 2-3 notable relationship patterns
}

## Guidelines
1. Focus on the central theme connecting these entities
2. Highlight what makes this community distinct
3. Mention the most important entities naturally
4. Describe relationship patterns, not individual edges
5. Keep the summary informative but concise

Return only valid JSON.`;

// =============================================================================
// Community Summary Service
// =============================================================================

export class CommunitySummaryService {
  private anthropic: Anthropic;
  private config: SummaryConfig;

  constructor(
    private supabase: SupabaseClient,
    config?: Partial<SummaryConfig>
  ) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate summary for a single community
   */
  async summarizeCommunity(
    communityId: string,
    config?: Partial<SummaryConfig>
  ): Promise<CommunitySummary> {
    const finalConfig = { ...this.config, ...config };

    // Check if summary already exists
    if (!finalConfig.forceRegenerate) {
      const existing = await this.getExistingSummary(communityId);
      if (existing) return existing;
    }

    // Load community data
    const communityData = await this.loadCommunityData(communityId, finalConfig);

    // Generate summary using LLM
    const summary = await this.generateSummary(communityData, finalConfig);

    // Generate embedding
    const embedding = await computeEmbedding(summary.summary);

    // Save to database
    await this.saveSummary(communityId, summary, embedding);

    return {
      communityId,
      ...summary,
      embedding,
    };
  }

  /**
   * Generate summaries for all communities in a graph
   */
  async summarizeAllCommunities(
    graphId: string,
    config?: Partial<SummaryConfig>
  ): Promise<{
    summarized: number;
    skipped: number;
    errors: Array<{ communityId: string; error: string }>;
  }> {
    const finalConfig = { ...this.config, ...config };

    // Get all communities
    const { data: communities, error } = await this.supabase
      .from('graph_communities')
      .select('id, summary')
      .eq('graph_id', graphId)
      .order('level')
      .order('member_count', { ascending: false });

    if (error) {
      throw new Error(`Failed to get communities: ${error.message}`);
    }

    let summarized = 0;
    let skipped = 0;
    const errors: Array<{ communityId: string; error: string }> = [];

    for (const community of communities || []) {
      // Skip if already has summary and not forcing regeneration
      if (community.summary && !finalConfig.forceRegenerate) {
        skipped++;
        continue;
      }

      try {
        await this.summarizeCommunity(community.id, finalConfig);
        summarized++;
      } catch (err) {
        errors.push({
          communityId: community.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { summarized, skipped, errors };
  }

  /**
   * Find communities relevant to a query
   */
  async findRelevantCommunities(
    graphId: string,
    query: string,
    options?: {
      topK?: number;
      minLevel?: number;
      maxLevel?: number;
      minSimilarity?: number;
    }
  ): Promise<SearchResult[]> {
    const topK = options?.topK ?? 5;
    const minLevel = options?.minLevel ?? 0;
    const maxLevel = options?.maxLevel ?? 10;
    const minSimilarity = options?.minSimilarity ?? 0.5;

    // Generate query embedding
    const queryEmbedding = await computeEmbedding(query, 'query');

    // Search using database function
    const { data, error } = await this.supabase.rpc('search_communities_by_embedding', {
      p_graph_id: graphId,
      p_query_embedding: queryEmbedding,
      p_top_k: topK,
      p_min_level: minLevel,
      p_max_level: maxLevel,
    });

    if (error) {
      // Fallback to manual search
      return this.searchCommunitiesFallback(graphId, queryEmbedding, topK, minSimilarity);
    }

    return (data || [])
      .filter((r: { similarity: number }) => r.similarity >= minSimilarity)
      .map((r: {
        community_id: string;
        name: string;
        level: number;
        member_count: number;
        summary: string;
        key_entities: string[];
        similarity: number;
      }) => ({
        community: {
          id: r.community_id,
          name: r.name,
          number: 0,
          level: r.level,
          members: [],
          density: 0,
          modularityContribution: 0,
          avgDegree: 0,
        },
        summary: r.summary,
        similarity: r.similarity,
      }));
  }

  /**
   * Get summary for drill-down (children summaries)
   */
  async getDrillDownSummaries(communityId: string): Promise<SearchResult[]> {
    const { data, error } = await this.supabase.rpc('get_community_children', {
      p_community_id: communityId,
    });

    if (error) {
      throw new Error(`Failed to get children: ${error.message}`);
    }

    return (data || []).map((c: {
      community_id: string;
      name: string;
      level: number;
      member_count: number;
      summary: string;
    }) => ({
      community: {
        id: c.community_id,
        name: c.name,
        number: 0,
        level: c.level,
        members: [],
        density: 0,
        modularityContribution: 0,
        avgDegree: 0,
      },
      summary: c.summary || '',
      similarity: 1.0, // Children are always relevant
    }));
  }

  /**
   * Refresh stale summaries
   */
  async refreshStaleSummaries(
    graphId: string,
    staleThresholdHours = 168 // 7 days
  ): Promise<number> {
    const threshold = new Date(Date.now() - staleThresholdHours * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .from('graph_communities')
      .select('id')
      .eq('graph_id', graphId)
      .or(`summary.is.null,summary_generated_at.lt.${threshold.toISOString()}`);

    if (error) {
      throw new Error(`Failed to find stale summaries: ${error.message}`);
    }

    let refreshed = 0;
    for (const community of data || []) {
      try {
        await this.summarizeCommunity(community.id, { forceRegenerate: true });
        refreshed++;
      } catch {
        // Continue on error
      }
    }

    return refreshed;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async getExistingSummary(communityId: string): Promise<CommunitySummary | null> {
    const { data, error } = await this.supabase
      .from('graph_communities')
      .select('summary, key_entities, key_topics, key_relationships, summary_embedding')
      .eq('id', communityId)
      .single();

    if (error || !data?.summary) return null;

    return {
      communityId,
      summary: data.summary,
      keyEntities: data.key_entities || [],
      keyTopics: data.key_topics || [],
      keyRelationships: data.key_relationships || [],
      embedding: data.summary_embedding || [],
    };
  }

  private async loadCommunityData(
    communityId: string,
    config: SummaryConfig
  ): Promise<string> {
    // Load entities in community
    const { data: entities } = await this.supabase.rpc('get_community_entities', {
      p_community_id: communityId,
      p_limit: config.maxEntities,
    });

    // Load community info
    const { data: community } = await this.supabase
      .from('graph_communities')
      .select('graph_id, member_count, level')
      .eq('id', communityId)
      .single();

    if (!community) {
      throw new Error('Community not found');
    }

    // Load relationships between entities
    const entityIds = (entities || []).map((e: { entity_id: string }) => e.entity_id);

    const { data: relations } = await this.supabase
      .from('graph_relations')
      .select(`
        relation_type,
        source:graph_entities!source_entity_id(name),
        target:graph_entities!target_entity_id(name)
      `)
      .eq('graph_id', community.graph_id)
      .in('source_entity_id', entityIds)
      .in('target_entity_id', entityIds)
      .limit(config.maxRelationships);

    // Format content for LLM
    let content = `Community Level: ${community.level}\n`;
    content += `Total Members: ${community.member_count}\n\n`;

    content += `## Key Entities (${(entities || []).length}):\n`;
    for (const entity of entities || []) {
      const hubLabel = entity.is_hub ? ' [HUB]' : '';
      content += `- ${entity.name} (${entity.entity_type})${hubLabel}\n`;
    }

    content += `\n## Relationships (${(relations || []).length}):\n`;
    for (const rel of relations || []) {
      const sourceName = (rel.source as unknown as { name: string })?.name || 'Unknown';
      const targetName = (rel.target as unknown as { name: string })?.name || 'Unknown';
      content += `- ${sourceName} --[${rel.relation_type}]--> ${targetName}\n`;
    }

    return content;
  }

  private async generateSummary(
    content: string,
    config: SummaryConfig
  ): Promise<Omit<CommunitySummary, 'communityId' | 'embedding'>> {
    const modelId = config.model === 'haiku'
      ? 'claude-3-5-haiku-20241022'
      : 'claude-3-5-sonnet-20241022';

    const prompt = SUMMARY_PROMPT.replace('{content}', content);

    const response = await this.anthropic.messages.create({
      model: modelId,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content[0];
    if (textContent.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const result = JSON.parse(textContent.text) as {
      summary: string;
      keyTopics: string[];
      keyRelationships: string[];
    };

    // Extract entity names from content for keyEntities
    const entityMatches = content.match(/^- (.+?) \(/gm) || [];
    const keyEntities = entityMatches
      .slice(0, 5)
      .map((m) => m.replace(/^- /, '').replace(/ \($/, ''));

    return {
      summary: result.summary,
      keyEntities,
      keyTopics: result.keyTopics || [],
      keyRelationships: result.keyRelationships || [],
    };
  }

  private async saveSummary(
    communityId: string,
    summary: Omit<CommunitySummary, 'communityId' | 'embedding'>,
    embedding: number[]
  ): Promise<void> {
    const { error } = await this.supabase
      .from('graph_communities')
      .update({
        summary: summary.summary,
        key_entities: summary.keyEntities,
        key_topics: summary.keyTopics,
        key_relationships: summary.keyRelationships,
        summary_embedding: embedding,
        summary_generated_at: new Date().toISOString(),
        summary_version: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', communityId);

    if (error) {
      throw new Error(`Failed to save summary: ${error.message}`);
    }
  }

  private async searchCommunitiesFallback(
    graphId: string,
    queryEmbedding: number[],
    topK: number,
    minSimilarity: number
  ): Promise<SearchResult[]> {
    // Load communities with embeddings
    const { data, error } = await this.supabase
      .from('graph_communities')
      .select('id, name, level, member_count, summary, summary_embedding')
      .eq('graph_id', graphId)
      .not('summary_embedding', 'is', null);

    if (error || !data) return [];

    // Calculate similarities
    const results = data
      .map((c) => ({
        community: {
          id: c.id,
          name: c.name,
          number: 0,
          level: c.level,
          members: [],
          density: 0,
          modularityContribution: 0,
          avgDegree: 0,
        },
        summary: c.summary || '',
        similarity: this.cosineSimilarity(queryEmbedding, c.summary_embedding || []),
      }))
      .filter((r) => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return results;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const norm = Math.sqrt(normA) * Math.sqrt(normB);
    return norm === 0 ? 0 : dotProduct / norm;
  }

  /**
   * Update config
   */
  setConfig(config: Partial<SummaryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createCommunitySummaryService(
  supabase: SupabaseClient,
  config?: Partial<SummaryConfig>
): CommunitySummaryService {
  return new CommunitySummaryService(supabase, config);
}
