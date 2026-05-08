/**
 * MCP Memory Tools
 *
 * Provides MCP-compatible tools for agent self-memory:
 * - memory.save: Store a new memory
 * - memory.search: Search memories
 * - memory.update: Update an existing memory
 * - memory.delete: Delete a memory
 * - memory.get: Get a specific memory by ID
 *
 * Based on Intelligent Memory Architecture (Spring 2.0) spec
 * Aligned with MCP specification 2025-11-25
 */

import { createServerClient } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/embeddings';
import { isUuid } from '@/lib/uuid';
import type { MemoryScope } from '@/lib/winter/scope';

// ============================================
// MCP Tool Definitions
// ============================================

export const MEMORY_TOOLS = {
  'memory.save': {
    name: 'memory.save',
    description: 'Save a new memory to the knowledge base. Use this to remember important information, facts, preferences, or instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to remember. Should be clear and self-contained.',
        },
        memory_type: {
          type: 'string',
          enum: ['fact', 'preference', 'instruction', 'episode', 'procedure'],
          description: 'Type of memory: fact (objective statement), preference (user taste), instruction (always-do rule), episode (event), procedure (how-to)',
          default: 'fact',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization',
        },
        scope: {
          type: 'string',
          enum: ['user', 'project', 'session', 'agent'],
          description: 'Memory scope: user (global), project (project-specific), session (session-only), agent (agent-specific)',
          default: 'user',
        },
        importance: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description: 'Importance score (1-10). Higher = more likely to be retrieved',
          default: 5,
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata',
        },
      },
      required: ['content'],
    },
  },

  'memory.search': {
    name: 'memory.search',
    description: 'Search the knowledge base for relevant memories. Use this to recall stored information.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        memory_types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['fact', 'preference', 'instruction', 'episode', 'procedure'],
          },
          description: 'Filter by memory types',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags',
        },
        scope: {
          type: 'string',
          enum: ['user', 'project', 'session', 'agent'],
          description: 'Scope to search in',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of results',
          default: 10,
        },
        min_relevance: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Minimum relevance score (0-1)',
          default: 0.5,
        },
      },
      required: ['query'],
    },
  },

  'memory.update': {
    name: 'memory.update',
    description: 'Update an existing memory. Use this to correct or enhance stored information.',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: 'ID of the memory to update',
        },
        content: {
          type: 'string',
          description: 'New content (if updating)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags (if updating)',
        },
        importance: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description: 'New importance score',
        },
        metadata: {
          type: 'object',
          description: 'Updated metadata (merged with existing)',
        },
      },
      required: ['memory_id'],
    },
  },

  'memory.delete': {
    name: 'memory.delete',
    description: 'Delete a memory. Use this to remove outdated or incorrect information.',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: 'ID of the memory to delete',
        },
        reason: {
          type: 'string',
          description: 'Optional reason for deletion',
        },
      },
      required: ['memory_id'],
    },
  },

  'memory.get': {
    name: 'memory.get',
    description: 'Get a specific memory by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: 'ID of the memory to retrieve',
        },
      },
      required: ['memory_id'],
    },
  },
};

// ============================================
// Tool Execution Context
// ============================================

export interface MemoryToolContext {
  userId: string;
  organizationId?: string;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  namespace?: string;
}

// ============================================
// Tool Handlers
// ============================================

/**
 * Execute a memory tool
 */
export async function executeMemoryTool(
  toolName: string,
  args: Record<string, unknown>,
  context: MemoryToolContext
): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}> {
  try {
    switch (toolName) {
      case 'memory.save':
        return await handleMemorySave(args, context);
      case 'memory.search':
        return await handleMemorySearch(args, context);
      case 'memory.update':
        return await handleMemoryUpdate(args, context);
      case 'memory.delete':
        return await handleMemoryDelete(args, context);
      case 'memory.get':
        return await handleMemoryGet(args, context);
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
 * Handle memory.save
 */
async function handleMemorySave(
  args: Record<string, unknown>,
  context: MemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();

  const content = args.content as string;
  if (!content || content.trim().length === 0) {
    return { success: false, error: 'Content is required' };
  }

  // Generate embedding
  const embedding = await generateEmbedding(content);

  // Determine scope context
  const scope = (args.scope as MemoryScope) || 'user';

  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: context.userId,
      organization_id: context.organizationId || null,
      content,
      embedding,
      memory_type: args.memory_type || 'fact',
      tags: (args.tags as string[]) || [],
      namespace: context.namespace || 'default',
      scope,
      project_id: scope !== 'user' ? context.projectId : null,
      session_id: scope === 'session' || scope === 'agent' ? context.sessionId : null,
      agent_id: scope === 'agent' ? context.agentId : null,
      importance: (args.importance as number) || 5,
      confidence: 1.0,
      source: 'mcp_tool',
      metadata: {
        ...(args.metadata as Record<string, unknown> || {}),
        created_via: 'memory.save',
        agent_id: context.agentId,
      },
    })
    .select('id, content, memory_type, tags, scope, importance, created_at')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    result: {
      memory_id: data.id,
      message: 'Memory saved successfully',
      memory: data,
    },
  };
}

/**
 * Handle memory.search
 */
async function handleMemorySearch(
  args: Record<string, unknown>,
  context: MemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();

  const query = args.query as string;
  if (!query || query.trim().length === 0) {
    return { success: false, error: 'Query is required' };
  }

  const limit = Math.min((args.limit as number) || 10, 50);
  const minRelevance = (args.min_relevance as number) || 0.5;

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Build base query
  const rpcQuery = supabase.rpc('search_memories', {
    match_user_id: context.userId,
    query_embedding: queryEmbedding,
    match_threshold: minRelevance,
    match_count: limit,
  });

  // Note: Additional filters would be applied via RPC parameters
  // For simplicity, we filter in post-processing

  const { data: memories, error } = await rpcQuery;

  if (error) {
    // Fallback to basic search if RPC doesn't exist
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('memories')
      .select('id, content, memory_type, tags, scope, importance, created_at')
      .eq('user_id', context.userId)
      .eq('is_deleted', false)
      .eq('is_encrypted', false)
      .limit(limit);

    if (fallbackError) {
      return { success: false, error: fallbackError.message };
    }

    return {
      success: true,
      result: {
        query,
        memories: (fallbackData || []).map((m: {
          id: string;
          content: string;
          memory_type: string;
          tags: string[];
          scope: string;
          importance: number;
          created_at: string;
        }) => ({
          id: m.id,
          content: m.content,
          memory_type: m.memory_type,
          tags: m.tags,
          scope: m.scope,
          importance: m.importance,
          created_at: m.created_at,
          relevance: 0.5, // Default relevance for fallback
        })),
        count: fallbackData?.length || 0,
      },
    };
  }

  type MemorySearchResult = {
    id: string;
    content: string;
    memory_type: string;
    tags?: string[];
    scope?: string;
    importance?: number;
    created_at?: string;
    similarity?: number;
    relevance?: number;
  };

  // Apply post-filters
  let results: MemorySearchResult[] = (memories || []) as MemorySearchResult[];

  if (args.memory_types) {
    const types = args.memory_types as string[];
    results = results.filter((m) => types.includes(m.memory_type));
  }

  if (args.tags) {
    const filterTags = args.tags as string[];
    results = results.filter((m) =>
      filterTags.some((t) => m.tags?.includes(t))
    );
  }

  if (args.scope) {
    results = results.filter((m) => m.scope === args.scope);
  }

  return {
    success: true,
    result: {
      query,
      memories: results.slice(0, limit).map((m) => ({
        id: m.id,
        content: m.content,
        memory_type: m.memory_type,
        tags: m.tags,
        scope: m.scope,
        importance: m.importance,
        created_at: m.created_at,
        relevance: m.similarity || m.relevance,
      })),
      count: results.length,
    },
  };
}

/**
 * Handle memory.update
 */
async function handleMemoryUpdate(
  args: Record<string, unknown>,
  context: MemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();

  const memoryId = args.memory_id as string;
  if (!memoryId) {
    return { success: false, error: 'memory_id is required' };
  }
  // R15 H3 — surface bad UUID as 400-equivalent before Postgres returns
  // 22P02 with column-name leak.
  if (!isUuid(memoryId)) {
    return { success: false, error: 'memory_id must be a valid UUID' };
  }

  // Fetch existing memory
  const { data: existing, error: fetchError } = await supabase
    .from('memories')
    .select('*')
    .eq('id', memoryId)
    .eq('user_id', context.userId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Memory not found' };
  }

  // R15 M4 — refuse all updates on encrypted rows, not just content. Tag,
  // importance, and metadata writes can fingerprint an encrypted row
  // (caller writes a marker, then reads back via memory.get to confirm
  // existence). Original R13 guard only caught args.content. Caller must
  // decrypt via REST PATCH (/api/memories/[id]) before touching any field.
  if (existing.is_encrypted === true) {
    return {
      success: false,
      error: 'cannot update an encrypted memory via MCP; disable encryption via REST PATCH first',
    };
  }

  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.content) {
    updates.content = args.content;
    updates.embedding = await generateEmbedding(args.content as string);
  }

  if (args.tags) {
    updates.tags = args.tags;
  }

  if (args.importance !== undefined) {
    updates.importance = args.importance;
  }

  if (args.metadata) {
    updates.metadata = {
      ...existing.metadata,
      ...(args.metadata as Record<string, unknown>),
      last_updated_via: 'memory.update',
    };
  }

  // R15 M5 — chain user_id on the UPDATE itself, not just the prior fetch.
  // Pre-fix the fetch confirmed ownership but the UPDATE only had .eq('id'),
  // a TOCTOU window where context.userId could in theory change between
  // the two HTTP calls. Closes the gap so ownership re-checks atomically
  // with the write.
  const { data, error } = await supabase
    .from('memories')
    .update(updates)
    .eq('id', memoryId)
    .eq('user_id', context.userId)
    .select('id, content, memory_type, tags, importance, updated_at')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    result: {
      memory_id: data.id,
      message: 'Memory updated successfully',
      memory: data,
    },
  };
}

/**
 * Handle memory.delete
 */
async function handleMemoryDelete(
  args: Record<string, unknown>,
  context: MemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();

  const memoryId = args.memory_id as string;
  if (!memoryId) {
    return { success: false, error: 'memory_id is required' };
  }
  if (!isUuid(memoryId)) {
    return { success: false, error: 'memory_id must be a valid UUID' };
  }

  // Soft delete
  const { error } = await supabase
    .from('memories')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      metadata: {
        deletion_reason: args.reason || 'deleted via memory.delete tool',
        deleted_by_agent: context.agentId,
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
 * Handle memory.get
 */
async function handleMemoryGet(
  args: Record<string, unknown>,
  context: MemoryToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabase = createServerClient();

  const memoryId = args.memory_id as string;
  if (!memoryId) {
    return { success: false, error: 'memory_id is required' };
  }
  if (!isUuid(memoryId)) {
    return { success: false, error: 'memory_id must be a valid UUID' };
  }

  const { data, error } = await supabase
    .from('memories')
    .select(`
      id,
      content,
      memory_type,
      tags,
      scope,
      importance,
      confidence,
      access_count,
      created_at,
      updated_at,
      last_accessed_at,
      metadata
    `)
    .eq('id', memoryId)
    .eq('user_id', context.userId)
    .eq('is_deleted', false)
    .single();

  if (error || !data) {
    return { success: false, error: 'Memory not found' };
  }

  // Update access count (ignore errors if RPC doesn't exist)
  try {
    await supabase.rpc('track_memory_access', { p_memory_id: memoryId });
  } catch {
    // Ignore if RPC doesn't exist
  }

  return {
    success: true,
    result: {
      memory: data,
    },
  };
}

// ============================================
// MCP Server Integration
// ============================================

/**
 * Get all memory tool definitions for MCP server registration
 */
export function getMemoryToolDefinitions(): typeof MEMORY_TOOLS {
  return MEMORY_TOOLS;
}

/**
 * Handle MCP tool call
 */
export async function handleMCPToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: MemoryToolContext
): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  const result = await executeMemoryTool(toolName, args, context);

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
