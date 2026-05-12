/**
 * Seizn Winter - Memory Scope Model
 *
 * Implements hierarchical memory scopes with inheritance:
 * - user: Global memories for a user (highest level)
 * - project: Project-specific memories (inherits from user)
 * - session: Session-specific memories (inherits from project or user)
 * - agent: Agent-specific memories (inherits from session, project, or user)
 */

import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type MemoryScope = 'user' | 'project' | 'session' | 'agent';

export interface ScopeContext {
  userId: string;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
}

export interface ScopeHierarchy {
  scope: MemoryScope;
  inheritsFrom: MemoryScope[];
  priority: number; // Higher = more specific
}

export interface ScopedMemoryQuery {
  userId: string;
  scope?: MemoryScope;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  includeInherited?: boolean;
  limit?: number;
}

export interface ScopedMemory {
  id: string;
  content: string;
  memory_type: string;
  scope: MemoryScope;
  project_id?: string;
  session_id?: string;
  agent_id?: string;
  confidence: number;
  importance: number;
  created_at: string;
  // Derived fields
  effective_scope: MemoryScope;
  inheritance_level: number;
}

// ============================================
// Scope Hierarchy Definition
// ============================================

export const SCOPE_HIERARCHY: Record<MemoryScope, ScopeHierarchy> = {
  user: {
    scope: 'user',
    inheritsFrom: [],
    priority: 1,
  },
  project: {
    scope: 'project',
    inheritsFrom: ['user'],
    priority: 2,
  },
  session: {
    scope: 'session',
    inheritsFrom: ['project', 'user'],
    priority: 3,
  },
  agent: {
    scope: 'agent',
    inheritsFrom: ['session', 'project', 'user'],
    priority: 4,
  },
};

// ============================================
// Scope Resolution Functions
// ============================================

/**
 * Get all scopes that should be queried for a given target scope
 * (including inherited scopes)
 */
export function getEffectiveScopes(targetScope: MemoryScope): MemoryScope[] {
  const hierarchy = SCOPE_HIERARCHY[targetScope];
  return [targetScope, ...hierarchy.inheritsFrom];
}

/**
 * Determine the effective scope for a memory based on context
 */
export function resolveEffectiveScope(context: ScopeContext): MemoryScope {
  if (context.agentId) return 'agent';
  if (context.sessionId) return 'session';
  if (context.projectId) return 'project';
  return 'user';
}

/**
 * Check if a scope is more specific than another
 */
export function isScopeMoreSpecific(
  scope1: MemoryScope,
  scope2: MemoryScope
): boolean {
  return SCOPE_HIERARCHY[scope1].priority > SCOPE_HIERARCHY[scope2].priority;
}

/**
 * Get the priority of a scope (higher = more specific)
 */
export function getScopePriority(scope: MemoryScope): number {
  return SCOPE_HIERARCHY[scope].priority;
}

// ============================================
// Database Query Functions
// ============================================

/**
 * Query memories with scope inheritance
 */
export async function queryScopedMemories(
  params: ScopedMemoryQuery
): Promise<ScopedMemory[]> {
  const supabase = createServerClient();

  const {
    userId,
    scope = 'user',
    projectId,
    sessionId,
    agentId,
    includeInherited = true,
    limit = 50,
  } = params;

  // Determine which scopes to query
  const scopesToQuery = includeInherited
    ? getEffectiveScopes(scope)
    : [scope];

  // Build the query conditions
  let query = supabase
    .from('memories')
    .select(
      `
      id,
      content,
      memory_type,
      scope,
      project_id,
      session_id,
      agent_id,
      confidence,
      importance,
      created_at
    `
    )
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .in('scope', scopesToQuery)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  // Add scope-specific filters
  if (scopesToQuery.includes('project') && projectId) {
    query = query.or(`project_id.eq.${projectId},scope.eq.user`);
  }

  if (scopesToQuery.includes('session') && sessionId) {
    query = query.or(
      `session_id.eq.${sessionId},project_id.eq.${projectId || 'null'},scope.eq.user`
    );
  }

  if (scopesToQuery.includes('agent') && agentId) {
    query = query.or(
      `agent_id.eq.${agentId},session_id.eq.${sessionId || 'null'},project_id.eq.${projectId || 'null'},scope.eq.user`
    );
  }

  const { data, error } = await query;

  if (error) throw error;

  // Enrich with inheritance information
  return (data || []).map((memory) => ({
    ...memory,
    effective_scope: memory.scope as MemoryScope,
    inheritance_level: calculateInheritanceLevel(
      memory.scope as MemoryScope,
      scope
    ),
  }));
}

/**
 * Calculate how many levels of inheritance away a memory is
 * from the target scope (0 = same scope, 1+ = inherited)
 */
function calculateInheritanceLevel(
  memoryScope: MemoryScope,
  targetScope: MemoryScope
): number {
  if (memoryScope === targetScope) return 0;

  const inheritedScopes = SCOPE_HIERARCHY[targetScope].inheritsFrom;
  const index = inheritedScopes.indexOf(memoryScope);

  return index === -1 ? -1 : index + 1;
}

// ============================================
// Scope-Based Memory Creation
// ============================================

export interface CreateScopedMemoryParams {
  userId: string;
  content: string;
  embedding: number[];
  memoryType?: string;
  tags?: string[];
  namespace?: string;
  scope?: MemoryScope;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  source?: string;
  confidence?: number;
  importance?: number;
}

/**
 * Create a memory with proper scope assignment
 */
export async function createScopedMemory(
  params: CreateScopedMemoryParams
): Promise<{ id: string; scope: MemoryScope }> {
  const supabase = createServerClient();

  // Auto-resolve scope if not provided
  const resolvedScope =
    params.scope ||
    resolveEffectiveScope({
      userId: params.userId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      agentId: params.agentId,
    });

  // Validate scope context consistency
  validateScopeContext(resolvedScope, {
    projectId: params.projectId,
    sessionId: params.sessionId,
    agentId: params.agentId,
  });

  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: params.userId,
      content: params.content,
      embedding: params.embedding,
      memory_type: params.memoryType || 'fact',
      tags: params.tags || [],
      namespace: params.namespace || 'default',
      scope: resolvedScope,
      project_id: params.projectId || null,
      session_id: params.sessionId || null,
      agent_id: params.agentId || null,
      source: params.source || 'api',
      confidence: params.confidence ?? 1.0,
      importance: params.importance ?? 5,
      is_encrypted: false,
      is_deleted: false,
      deleted_at: null,
    })
    .select('id, scope')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    scope: data.scope as MemoryScope,
  };
}

/**
 * Validate that scope context IDs are consistent with the scope level
 */
function validateScopeContext(
  scope: MemoryScope,
  context: { projectId?: string; sessionId?: string; agentId?: string }
): void {
  const errors: string[] = [];

  switch (scope) {
    case 'agent':
      if (!context.agentId) {
        errors.push('agent_id required for agent scope');
      }
      break;
    case 'session':
      if (!context.sessionId) {
        errors.push('session_id required for session scope');
      }
      break;
    case 'project':
      if (!context.projectId) {
        errors.push('project_id required for project scope');
      }
      break;
    case 'user':
      // No additional context required for user scope
      break;
  }

  if (errors.length > 0) {
    throw new Error(`Invalid scope context: ${errors.join(', ')}`);
  }
}

// ============================================
// Scope Statistics
// ============================================

export interface ScopeStats {
  scope: MemoryScope;
  count: number;
  avgConfidence: number;
  avgImportance: number;
}

/**
 * Get memory statistics by scope for a user
 */
export async function getScopeStats(userId: string): Promise<ScopeStats[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('memories')
    .select('scope, confidence, importance')
    .eq('user_id', userId)
    .eq('is_deleted', false);

  if (error) throw error;

  // Aggregate by scope
  const scopeMap = new Map<
    MemoryScope,
    { count: number; totalConf: number; totalImp: number }
  >();

  for (const memory of data || []) {
    const scope = memory.scope as MemoryScope;
    const existing = scopeMap.get(scope) || {
      count: 0,
      totalConf: 0,
      totalImp: 0,
    };

    scopeMap.set(scope, {
      count: existing.count + 1,
      totalConf: existing.totalConf + (memory.confidence || 0),
      totalImp: existing.totalImp + (memory.importance || 0),
    });
  }

  return Array.from(scopeMap.entries()).map(([scope, stats]) => ({
    scope,
    count: stats.count,
    avgConfidence: stats.count > 0 ? stats.totalConf / stats.count : 0,
    avgImportance: stats.count > 0 ? stats.totalImp / stats.count : 0,
  }));
}
