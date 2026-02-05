/**
 * MCP Memory Tools v4 (Spring Memory)
 *
 * Provides MCP-compatible tools for agent memory operations using Memory v4 architecture.
 * Integrates with ingestion rules, semantic updates, and usage tracking.
 *
 * Tools:
 * - spring.memory.save: Store with ingestion rules evaluation
 * - spring.memory.search: Search with v3 filters and reranking
 * - spring.memory.update: Semantic update with relationship detection
 * - spring.memory.delete: Soft delete with usage tracking
 * - spring.memory.get: Get with usage recording
 * - spring.memory.bulk_ingest: Async bulk ingestion
 *
 * Based on Mem0-inspired Memory v4 specification
 */

import { createServerClient } from '@/lib/supabase';
import { createIngestionService } from './ingestion-service';
import { createSearchServiceV3 } from './search-service';
import { createSemanticUpdateService } from './semantic-update-service';
import { createMemoryUsageService } from './usage-service';
import { createJobService } from './job-service';
import { createContextService } from './context-service';
import { createTemporalQueryService } from './temporal-query';
import { getLanguageProcessor } from './language-processor';
import { computeEmbedding } from '@/lib/embeddings';
import { detectPII } from '@/lib/security/pii-detector';
import { detectMultilingualPII } from '@/lib/langpack/pii';
import type { SearchFiltersV3 } from './types';

// =============================================================================
// MCP Tool Definitions
// =============================================================================

export const SPRING_MEMORY_TOOLS = {
  'spring.memory.save': {
    name: 'spring.memory.save',
    description: 'Save a new memory with ingestion rules evaluation. Automatically applies redaction, blocking, and categorization.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to remember. Should be clear and self-contained.',
        },
        type: {
          type: 'string',
          enum: ['fact', 'preference', 'instruction', 'episode', 'procedure', 'note'],
          description: 'Type of memory',
          default: 'fact',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization',
        },
        workspace_id: {
          type: 'string',
          description: 'Optional workspace ID for scoping',
        },
        namespace: {
          type: 'string',
          description: 'Optional namespace (e.g., project name)',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Confidence score (0-1)',
          default: 0.8,
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata',
        },
      },
      required: ['content'],
    },
  },

  'spring.memory.search': {
    name: 'spring.memory.search',
    description: 'Search memories with advanced filtering, query expansion, and reranking.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by memory types',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags',
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by categories (health, finance, personal, etc.)',
        },
        workspace_id: {
          type: 'string',
          description: 'Filter by workspace',
        },
        namespace: {
          type: 'string',
          description: 'Filter by namespace',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of results',
          default: 10,
        },
        min_confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Minimum confidence score',
          default: 0.5,
        },
        use_query_expansion: {
          type: 'boolean',
          description: 'Enable LLM-based query expansion',
          default: false,
        },
        use_reranking: {
          type: 'boolean',
          description: 'Enable LLM-based result reranking',
          default: false,
        },
        include_candidates: {
          type: 'boolean',
          description: 'Include candidate memories (pending approval)',
          default: false,
        },
        context: {
          type: 'string',
          description: 'Additional context for reranking',
        },
      },
      required: ['query'],
    },
  },

  'spring.memory.update': {
    name: 'spring.memory.update',
    description: 'Update a memory with semantic analysis. Detects relationships (update, merge, supersede, contradict).',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: 'ID of the memory to update',
        },
        content: {
          type: 'string',
          description: 'New content (triggers semantic analysis)',
        },
        type: {
          type: 'string',
          description: 'New type',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags',
        },
        metadata: {
          type: 'object',
          description: 'Metadata to merge',
        },
        use_semantic_update: {
          type: 'boolean',
          description: 'Use semantic update (find and merge related memories)',
          default: false,
        },
      },
      required: ['memory_id'],
    },
  },

  'spring.memory.delete': {
    name: 'spring.memory.delete',
    description: 'Delete a memory (soft delete with audit trail).',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: 'ID of the memory to delete',
        },
        reason: {
          type: 'string',
          description: 'Reason for deletion (for audit)',
        },
      },
      required: ['memory_id'],
    },
  },

  'spring.memory.get': {
    name: 'spring.memory.get',
    description: 'Get a specific memory by ID with usage stats.',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: 'ID of the memory to retrieve',
        },
        include_usage: {
          type: 'boolean',
          description: 'Include usage statistics',
          default: true,
        },
        include_related: {
          type: 'boolean',
          description: 'Include related memories',
          default: false,
        },
      },
      required: ['memory_id'],
    },
  },

  'spring.memory.bulk_ingest': {
    name: 'spring.memory.bulk_ingest',
    description: 'Queue multiple memories for async ingestion. Returns a job ID to track progress.',
    inputSchema: {
      type: 'object',
      properties: {
        memories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              type: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              metadata: { type: 'object' },
            },
            required: ['content'],
          },
          description: 'Array of memories to ingest',
        },
      },
      required: ['memories'],
    },
  },

  'spring.context.get': {
    name: 'spring.context.get',
    description: 'Get formatted context string ready for LLM prompt injection. Zep/Memobase-style API.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['brief', 'detailed', 'extended', 'custom'],
          description: 'Context format preset',
          default: 'detailed',
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum tokens for the context',
          default: 1500,
        },
        include_profile: {
          type: 'boolean',
          description: 'Include user profile summary',
          default: true,
        },
        include_recent_messages: {
          type: 'boolean',
          description: 'Include recent conversation messages',
          default: true,
        },
        include_facts: {
          type: 'boolean',
          description: 'Include relevant facts/memories',
          default: true,
        },
        include_graph: {
          type: 'boolean',
          description: 'Include graph-based relationships',
          default: false,
        },
        tier_strategy: {
          type: 'string',
          enum: ['hot_first', 'balanced', 'comprehensive'],
          description: 'Tier retrieval strategy',
          default: 'balanced',
        },
        query: {
          type: 'string',
          description: 'Optional query for relevance-based retrieval',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by memory types',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags',
        },
      },
      required: [],
    },
  },

  'spring.temporal.search': {
    name: 'spring.temporal.search',
    description: 'Search memories with temporal filtering. Find facts valid at a specific time.',
    inputSchema: {
      type: 'object',
      properties: {
        valid_at: {
          type: 'string',
          format: 'date-time',
          description: 'Find facts valid at this specific time (ISO 8601)',
        },
        valid_between_start: {
          type: 'string',
          format: 'date-time',
          description: 'Start of validity range',
        },
        valid_between_end: {
          type: 'string',
          format: 'date-time',
          description: 'End of validity range',
        },
        created_after: {
          type: 'string',
          format: 'date-time',
          description: 'Created after this date',
        },
        created_before: {
          type: 'string',
          format: 'date-time',
          description: 'Created before this date',
        },
        include_expired: {
          type: 'boolean',
          description: 'Include expired facts',
          default: false,
        },
        include_superseded: {
          type: 'boolean',
          description: 'Include superseded facts',
          default: false,
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by memory types',
        },
        limit: {
          type: 'number',
          description: 'Maximum results',
          default: 20,
        },
      },
      required: [],
    },
  },

  'spring.temporal.timeline': {
    name: 'spring.temporal.timeline',
    description: 'Get timeline of memories ordered by event time or creation time.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          format: 'date-time',
          description: 'Start of timeline range',
        },
        end_date: {
          type: 'string',
          format: 'date-time',
          description: 'End of timeline range',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by memory types',
        },
        limit: {
          type: 'number',
          description: 'Maximum entries',
          default: 50,
        },
      },
      required: [],
    },
  },
};

// =============================================================================
// Tool Execution Context
// =============================================================================

export interface SpringMemoryToolContext {
  userId: string;
  organizationId?: string;
  workspaceId?: string;
  namespace?: string;
  agentId?: string;
  sessionId?: string;
  source?: string;
}

// =============================================================================
// Tool Handlers
// =============================================================================

/**
 * Execute a Spring memory tool
 */
export async function executeSpringMemoryTool(
  toolName: string,
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}> {
  try {
    switch (toolName) {
      case 'spring.memory.save':
        return await handleSave(args, context);
      case 'spring.memory.search':
        return await handleSearch(args, context);
      case 'spring.memory.update':
        return await handleUpdate(args, context);
      case 'spring.memory.delete':
        return await handleDelete(args, context);
      case 'spring.memory.get':
        return await handleGet(args, context);
      case 'spring.memory.bulk_ingest':
        return await handleBulkIngest(args, context);
      case 'spring.context.get':
        return await handleContextGet(args, context);
      case 'spring.temporal.search':
        return await handleTemporalSearch(args, context);
      case 'spring.temporal.timeline':
        return await handleTemporalTimeline(args, context);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle spring.memory.save
 */
async function handleSave(
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();
  const ingestionService = createIngestionService(supabase);

  const content = args.content as string;
  if (!content || content.trim().length === 0) {
    return { success: false, error: 'Content is required' };
  }

  // Get user settings
  const settings = await ingestionService.getSettings(context.userId);

  // Evaluate ingestion rules
  const evaluation = await ingestionService.evaluateIngestion(
    context.userId,
    content,
    {
      noteType: args.type as string,
      workspaceId: (args.workspace_id as string) || context.workspaceId,
      namespace: (args.namespace as string) || context.namespace,
      agentId: context.agentId,
    }
  );

  if (evaluation.action === 'deny') {
    return {
      success: false,
      error: `Memory denied: ${evaluation.reason || 'Blocked by ingestion rules'}`,
      result: {
        action: 'denied',
        ruleId: evaluation.ruleId,
        ruleName: evaluation.ruleName,
      },
    };
  }

  // Determine content to store
  const finalContent = evaluation.action === 'redact'
    ? (evaluation.redactedContent || content)
    : content;
  const isCandidate = evaluation.action === 'store_as_candidate' || settings.candidateModeEnabled;

  // --- Multilingual pipeline ---
  const langProcessor = getLanguageProcessor();

  // 1. Language detection, normalization, tokenization
  const langResult = await langProcessor.processForStorage(finalContent);

  // 2. Generate embedding
  const embedding = await computeEmbedding(finalContent, 'document');

  // 3. Canonical English translation (for non-English content)
  const canonical = await langProcessor.generateCanonical(
    finalContent,
    langResult.language
  );

  // 4. Cross-script variants (zh-Hans/zh-Hant, romanized)
  const contentAlt = langProcessor.generateContentAlt(finalContent, langResult.language);
  const hasContentAlt = Object.keys(contentAlt).length > 0;

  // 5. PII scanning (base + language-specific patterns)
  const basePiiResult = detectPII(finalContent, { minConfidence: 0.7 });
  const langPiiResult = detectMultilingualPII(finalContent, langResult.language, 0.7);
  const piiDetected = basePiiResult.found || langPiiResult.found;
  const piiTypes = Array.from(new Set([
    ...basePiiResult.types,
    ...langPiiResult.types,
  ]));

  // Store the memory (with multilingual columns)
  const { data, error } = await supabase
    .from('spring_memory_notes')
    .insert({
      user_id: context.userId,
      content: finalContent,
      note_type: (args.type as string) || 'fact',
      tags: (args.tags as string[]) || [],
      confidence: (args.confidence as number) || evaluation.confidence || 0.8,
      scope: (args.namespace as string) || context.namespace || 'user',
      status: isCandidate ? 'candidate' : 'active',
      embedding,
      // Multilingual columns
      language: langResult.language,
      script_type: langResult.scriptType,
      language_confidence: langResult.languageConfidence,
      lex_tokens: langResult.lexTokens,
      phonetic_tokens: langResult.phoneticTokens,
      content_canonical_en: canonical?.contentCanonicalEn || null,
      embedding_canonical: canonical?.embeddingCanonical || null,
      content_alt: hasContentAlt ? contentAlt : {},
      payload_json: {
        ...(args.metadata as Record<string, unknown> || {}),
        source: context.source || 'mcp_tool',
        agent_id: context.agentId,
        session_id: context.sessionId,
        rule_id: evaluation.ruleId,
        pii_detected: piiDetected,
        pii_types: piiTypes,
        pii_count: basePiiResult.count + langPiiResult.count,
        pii_max_confidence: Math.max(
          basePiiResult.maxConfidence,
          langPiiResult.maxConfidence
        ),
      },
    })
    .select('id, content, note_type, tags, confidence, status, created_at')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    result: {
      memory_id: data.id,
      action: evaluation.action,
      is_candidate: isCandidate,
      message: isCandidate ? 'Memory saved as candidate (pending approval)' : 'Memory saved successfully',
      memory: {
        id: data.id,
        content: data.content,
        type: data.note_type,
        tags: data.tags,
        confidence: data.confidence,
        created_at: data.created_at,
      },
    },
  };
}

/**
 * Handle spring.memory.search
 */
async function handleSearch(
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();
  const searchService = createSearchServiceV3(supabase);

  const query = args.query as string;
  if (!query || query.trim().length === 0) {
    return { success: false, error: 'Query is required' };
  }

  // Build filters using SearchFiltersV3 interface
  const filters: SearchFiltersV3 = {
    types: args.types as string[],
    tags: args.tags as string[],
    categories: args.categories as string[],
    namespace: (args.namespace as string) || context.namespace,
  };

  // Search using the correct method signature
  const response = await searchService.search(context.userId, {
    query,
    filters,
    topK: Math.min((args.limit as number) || 10, 50),
    expandQuery: args.use_query_expansion as boolean,
    rerank: args.use_reranking as boolean,
  });

  return {
    success: true,
    result: {
      query,
      count: response.results.length,
      total: response.total,
      memories: response.results.map(r => ({
        id: r.id,
        content: r.content,
        type: r.type,
        tags: r.tags,
        category: r.category,
        semantic_score: r.semanticScore,
        keyword_score: r.keywordScore,
        combined_score: r.combinedScore,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      })),
    },
  };
}

/**
 * Handle spring.memory.update
 */
async function handleUpdate(
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();

  const memoryId = args.memory_id as string;
  if (!memoryId) {
    return { success: false, error: 'memory_id is required' };
  }

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('spring_memory_notes')
    .select('*')
    .eq('id', memoryId)
    .eq('user_id', context.userId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Memory not found' };
  }

  // Check if semantic update is requested
  if (args.use_semantic_update && args.content) {
    const semanticService = createSemanticUpdateService(supabase);
    const result = await semanticService.semanticUpdate(context.userId, {
      statement: args.content as string,
      autoApply: true,
      dryRun: false,
    });

    return {
      success: true,
      result: {
        memory_id: memoryId,
        statement: result.statement,
        candidates: result.candidates.length,
        applied_changes: result.appliedChanges,
        dry_run: result.dryRun,
        processing_ms: result.processingMs,
      },
    };
  }

  // Standard update (using v3 column names)
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.content) updates.content = args.content;
  if (args.type) updates.note_type = args.type;
  if (args.tags) updates.tags = args.tags;
  if (args.metadata) {
    updates.payload_json = {
      ...(existing.payload_json || {}),
      ...(args.metadata as Record<string, unknown>),
      last_updated_via: 'spring.memory.update',
      updated_by_agent: context.agentId,
    };
  }

  const { data, error } = await supabase
    .from('spring_memory_notes')
    .update(updates)
    .eq('id', memoryId)
    .select('id, content, note_type, tags, updated_at')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    result: {
      memory_id: data.id,
      message: 'Memory updated successfully',
      memory: {
        id: data.id,
        content: data.content,
        type: data.note_type,
        tags: data.tags,
        updated_at: data.updated_at,
      },
    },
  };
}

/**
 * Handle spring.memory.delete
 */
async function handleDelete(
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();

  const memoryId = args.memory_id as string;
  if (!memoryId) {
    return { success: false, error: 'memory_id is required' };
  }

  // Soft delete by updating status
  const { error } = await supabase
    .from('spring_memory_notes')
    .update({
      status: 'deleted',
      updated_at: new Date().toISOString(),
      payload_json: {
        deletion_reason: args.reason || 'deleted via spring.memory.delete',
        deleted_by_agent: context.agentId,
        deleted_at: new Date().toISOString(),
      },
    })
    .eq('id', memoryId)
    .eq('user_id', context.userId);

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    result: {
      memory_id: memoryId,
      message: 'Memory deleted successfully',
    },
  };
}

/**
 * Handle spring.memory.get
 */
async function handleGet(
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();
  const usageService = createMemoryUsageService(supabase);

  const memoryId = args.memory_id as string;
  if (!memoryId) {
    return { success: false, error: 'memory_id is required' };
  }

  const { data, error } = await supabase
    .from('spring_memory_notes')
    .select('*')
    .eq('id', memoryId)
    .eq('user_id', context.userId)
    .neq('status', 'deleted')
    .single();

  if (error || !data) {
    return { success: false, error: 'Memory not found' };
  }

  // Record usage (using correct RecordUsageInput fields)
  await usageService.recordUsage({
    noteId: memoryId,
    usageType: 'recalled',
    sessionId: context.sessionId,
    agentId: context.agentId,
  }).catch(() => {});

  const result: Record<string, unknown> = {
    memory: {
      id: data.id,
      content: data.content,
      type: data.note_type,
      tags: data.tags,
      confidence: data.confidence,
      scope: data.scope,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
      metadata: data.payload_json,
    },
  };

  // Include usage stats if requested
  if (args.include_usage) {
    const stats = await usageService.getNoteUsageStats(memoryId);
    result.usage_stats = stats;
  }

  // Include related memories if requested
  if (args.include_related) {
    const searchService = createSearchServiceV3(supabase);
    const searchResponse = await searchService.search(context.userId, {
      query: data.content,
      topK: 5,
    });
    // Filter out the current memory
    result.related_memories = searchResponse.results
      .filter(r => r.id !== memoryId)
      .slice(0, 5)
      .map(r => ({
        id: r.id,
        content: r.content,
        score: r.combinedScore,
      }));
  }

  return { success: true, result };
}

/**
 * Handle spring.memory.bulk_ingest
 */
async function handleBulkIngest(
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();
  const jobService = createJobService(supabase);

  const memories = args.memories as Array<{
    content: string;
    type?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }>;

  if (!memories || !Array.isArray(memories) || memories.length === 0) {
    return { success: false, error: 'memories array is required' };
  }

  // Add source info to each memory
  const memoriesWithSource = memories.map(m => ({
    ...m,
    metadata: {
      ...m.metadata,
      source: context.source || 'mcp_bulk_ingest',
      agent_id: context.agentId,
    },
  }));

  // Create async job
  const job = await jobService.createIngestionJob(context.userId, memoriesWithSource);

  return {
    success: true,
    result: {
      job_id: job.id,
      status: job.status,
      total_items: memories.length,
      message: `Bulk ingestion job created. Track progress with job ID: ${job.id}`,
    },
  };
}

/**
 * Handle spring.context.get
 */
async function handleContextGet(
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();
  const contextService = createContextService(supabase);

  const response = await contextService.getContext(context.userId, {
    format: (args.format as 'brief' | 'detailed' | 'extended' | 'custom') || 'detailed',
    maxTokens: args.max_tokens as number,
    includeProfile: args.include_profile as boolean ?? true,
    includeRecentMessages: args.include_recent_messages as boolean ?? true,
    includeFacts: args.include_facts as boolean ?? true,
    includeGraph: args.include_graph as boolean ?? false,
    tierStrategy: args.tier_strategy as 'hot_first' | 'balanced' | 'comprehensive',
    query: args.query as string,
    types: args.types as string[],
    tags: args.tags as string[],
  });

  return {
    success: true,
    result: {
      context_string: response.contextString,
      token_count: response.tokenCount,
      facts_included: response.metadata.factsIncluded,
      format: response.metadata.format,
      has_profile: !!response.profile,
      has_messages: !!response.recentMessages,
      processing_ms: response.metadata.processingMs,
    },
  };
}

/**
 * Handle spring.temporal.search
 */
async function handleTemporalSearch(
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();
  const temporalService = createTemporalQueryService(supabase);

  const temporalFilter = {
    validAt: args.valid_at ? new Date(args.valid_at as string) : undefined,
    validBetween: args.valid_between_start && args.valid_between_end
      ? {
          start: new Date(args.valid_between_start as string),
          end: new Date(args.valid_between_end as string),
        }
      : undefined,
    createdAfter: args.created_after ? new Date(args.created_after as string) : undefined,
    createdBefore: args.created_before ? new Date(args.created_before as string) : undefined,
    excludeExpired: !(args.include_expired as boolean),
    includeSuperseded: args.include_superseded as boolean ?? false,
  };

  const results = await temporalService.searchWithTemporalFilter(
    context.userId,
    temporalFilter,
    {
      topK: (args.limit as number) || 20,
      types: args.types as string[],
    }
  );

  return {
    success: true,
    result: {
      count: results.length,
      memories: results.map(r => ({
        id: r.id,
        content: r.content,
        type: r.type,
        valid_from: r.validFrom?.toISOString(),
        valid_to: r.validTo?.toISOString(),
        event_time: r.eventTime?.toISOString(),
        created_at: r.createdAt.toISOString(),
      })),
    },
  };
}

/**
 * Handle spring.temporal.timeline
 */
async function handleTemporalTimeline(
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();
  const temporalService = createTemporalQueryService(supabase);

  const timeline = await temporalService.getTimeline(context.userId, {
    startDate: args.start_date ? new Date(args.start_date as string) : undefined,
    endDate: args.end_date ? new Date(args.end_date as string) : undefined,
    types: args.types as string[],
    limit: (args.limit as number) || 50,
  });

  return {
    success: true,
    result: {
      count: timeline.length,
      entries: timeline.map(e => ({
        id: e.id,
        content: e.content,
        type: e.type,
        event_time: e.eventTime.toISOString(),
        valid_from: e.validFrom?.toISOString(),
        valid_to: e.validTo?.toISOString(),
        is_currently_valid: e.isCurrentlyValid,
      })),
    },
  };
}

// =============================================================================
// MCP Server Integration
// =============================================================================

/**
 * Get all Spring memory tool definitions for MCP server registration
 */
export function getSpringMemoryToolDefinitions(): typeof SPRING_MEMORY_TOOLS {
  return SPRING_MEMORY_TOOLS;
}

/**
 * Handle MCP tool call
 */
export async function handleSpringMCPToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: SpringMemoryToolContext
): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  const result = await executeSpringMemoryTool(toolName, args, context);

  if (result.success) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.result, null, 2),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `Error: ${result.error}`,
      },
    ],
    isError: true,
  };
}
