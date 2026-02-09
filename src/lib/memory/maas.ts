/**
 * Memory as a Service (MaaS) Architecture
 *
 * Decouples memory from its bound state and redesigns it as a
 * service-oriented module. Memory becomes independently callable,
 * dynamically composable, and finely governed.
 *
 * Key Abstractions:
 * - MemoryNamespace: Isolated memory spaces with access controls
 * - MemoryChannel: Typed communication channels between agents
 * - MemoryPolicy: Rules governing retention, access, and sharing
 * - MemoryBroker: Routes memory operations to the right namespace
 *
 * Multi-tenant support:
 * - Private: User's own memories (default)
 * - Shared: Team-scoped memories with provenance tracking
 * - Public: Organization-wide knowledge base
 *
 * @see https://arxiv.org/abs/2506.22815 (Memory as a Service)
 * @see https://arxiv.org/abs/2505.18279 (Collaborative Memory, ICML 2025)
 */

import { createServerClient } from '../supabase';

// ============================================
// Types
// ============================================

export type NamespaceScope = 'private' | 'shared' | 'public';
export type ChannelType = 'episodic' | 'semantic' | 'procedural' | 'profile';
export type AccessLevel = 'read' | 'write' | 'admin';

export interface MemoryNamespace {
  /** Unique namespace identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Scope determines visibility */
  scope: NamespaceScope;
  /** Owner user/org ID */
  ownerId: string;
  /** Organization ID (for shared/public scopes) */
  organizationId?: string;
  /** Memory channels available in this namespace */
  channels: ChannelType[];
  /** Retention policy */
  retentionPolicy: RetentionPolicy;
  /** Access control list */
  acl: AccessControlEntry[];
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: Date;
}

export interface RetentionPolicy {
  /** Maximum memory count (0 = unlimited) */
  maxMemories: number;
  /** Maximum age in days (0 = unlimited) */
  maxAgeDays: number;
  /** Auto-archive threshold (importance below this) */
  archiveThreshold: number;
  /** Auto-delete threshold (importance below this AND age > maxAgeDays) */
  deleteThreshold: number;
  /** Consolidation frequency (hours, 0 = disabled) */
  consolidationIntervalHours: number;
}

export interface AccessControlEntry {
  /** Subject: user ID or org role */
  subject: string;
  /** Subject type */
  subjectType: 'user' | 'role' | 'team' | 'organization';
  /** Access level */
  level: AccessLevel;
  /** Optional channel restrictions */
  channels?: ChannelType[];
  /** Granted at */
  grantedAt: Date;
  /** Expires at (null = permanent) */
  expiresAt?: Date;
}

export interface MemoryOperation {
  /** Operation ID for tracking */
  operationId: string;
  /** Target namespace */
  namespaceId: string;
  /** Channel within the namespace */
  channel: ChannelType;
  /** Operation type */
  type: 'store' | 'search' | 'update' | 'delete' | 'consolidate';
  /** Operator (who initiated) */
  operatorId: string;
  /** Operation payload */
  payload: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
  /** Result (populated after execution) */
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
    latencyMs: number;
  };
}

export interface ProvenanceRecord {
  /** Memory ID */
  memoryId: string;
  /** Namespace where this memory originated */
  originNamespace: string;
  /** Original creator */
  createdBy: string;
  /** Agents/users who contributed */
  contributors: string[];
  /** Namespaces this memory has been shared to */
  sharedTo: string[];
  /** Full operation history */
  operations: Array<{
    type: string;
    operator: string;
    timestamp: Date;
    details?: string;
  }>;
}

// ============================================
// MaaS Broker
// ============================================

/**
 * Memory Broker — Routes operations to the correct namespace
 * with access control enforcement and provenance tracking.
 */
export class MemoryBroker {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Create a new namespace.
   */
  async createNamespace(
    config: Omit<MemoryNamespace, 'id' | 'createdAt'>
  ): Promise<MemoryNamespace> {
    const supabase = createServerClient();

    const namespace: MemoryNamespace = {
      ...config,
      id: `ns_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
    };

    // Store namespace configuration
    await supabase.from('memory_namespaces').insert({
      id: namespace.id,
      name: namespace.name,
      scope: namespace.scope,
      owner_id: namespace.ownerId,
      organization_id: namespace.organizationId,
      channels: namespace.channels,
      retention_policy: namespace.retentionPolicy,
      acl: namespace.acl,
      metadata: namespace.metadata,
      created_at: namespace.createdAt.toISOString(),
    });

    return namespace;
  }

  /**
   * Execute a memory operation within a namespace.
   *
   * Enforces access control and records provenance.
   */
  async execute(
    operation: Omit<MemoryOperation, 'operationId' | 'timestamp' | 'result'>
  ): Promise<MemoryOperation> {
    const startTime = Date.now();
    const op: MemoryOperation = {
      ...operation,
      operationId: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
    };

    try {
      // 1. Check access
      const hasAccess = await this.checkAccess(
        op.namespaceId,
        op.operatorId,
        op.type === 'search' ? 'read' : 'write'
      );

      if (!hasAccess) {
        op.result = {
          success: false,
          error: 'Access denied: insufficient permissions for this namespace',
          latencyMs: Date.now() - startTime,
        };
        return op;
      }

      // 2. Route to handler
      const supabase = createServerClient();

      switch (op.type) {
        case 'store': {
          const content = op.payload.content as string;
          const memoryType = (op.payload.memoryType as string) || 'fact';
          const tags = (op.payload.tags as string[]) || [];

          const { data, error } = await supabase
            .from('memories')
            .insert({
              user_id: op.operatorId,
              content,
              memory_type: memoryType,
              tags: [...tags, `ns:${op.namespaceId}`, `ch:${op.channel}`],
              source: 'maas',
              namespace: op.namespaceId,
              importance: (op.payload.importance as number) || 5,
            })
            .select('id')
            .single();

          op.result = {
            success: !error,
            data: data ? { memoryId: data.id } : undefined,
            error: error?.message,
            latencyMs: Date.now() - startTime,
          };
          break;
        }

        case 'search': {
          const query = op.payload.query as string;
          const limit = (op.payload.limit as number) || 10;

          // Search within namespace
          const { data: results, error } = await supabase
            .from('memories')
            .select('id, content, memory_type, importance, created_at')
            .eq('namespace', op.namespaceId)
            .eq('is_deleted', false)
            .textSearch('content', query, { type: 'websearch' })
            .limit(limit);

          op.result = {
            success: !error,
            data: { results: results || [] },
            error: error?.message,
            latencyMs: Date.now() - startTime,
          };
          break;
        }

        case 'delete': {
          const memoryId = op.payload.memoryId as string;

          const { error } = await supabase
            .from('memories')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', memoryId)
            .eq('namespace', op.namespaceId);

          op.result = {
            success: !error,
            error: error?.message,
            latencyMs: Date.now() - startTime,
          };
          break;
        }

        default:
          op.result = {
            success: false,
            error: `Unknown operation type: ${op.type}`,
            latencyMs: Date.now() - startTime,
          };
      }

      // 3. Record operation for audit trail
      await this.recordOperation(op);

      return op;
    } catch (error) {
      op.result = {
        success: false,
        error: (error as Error).message,
        latencyMs: Date.now() - startTime,
      };
      return op;
    }
  }

  /**
   * Share a memory from one namespace to another.
   */
  async shareMemory(
    memoryId: string,
    fromNamespace: string,
    toNamespace: string
  ): Promise<boolean> {
    // Check write access to target namespace
    const hasAccess = await this.checkAccess(toNamespace, this.userId, 'write');
    if (!hasAccess) return false;

    const supabase = createServerClient();

    // Get original memory
    const { data: original } = await supabase
      .from('memories')
      .select('*')
      .eq('id', memoryId)
      .eq('namespace', fromNamespace)
      .single();

    if (!original) return false;

    // Create a reference in the target namespace
    const { error } = await supabase.from('memories').insert({
      user_id: this.userId,
      content: original.content,
      embedding: original.embedding,
      memory_type: original.memory_type,
      tags: [...(original.tags || []), `shared:${fromNamespace}`, `ns:${toNamespace}`],
      source: 'maas_share',
      namespace: toNamespace,
      importance: original.importance,
    });

    return !error;
  }

  /**
   * List all namespaces accessible by the current user.
   */
  async listNamespaces(): Promise<MemoryNamespace[]> {
    const supabase = createServerClient();

    // Get owned + accessible namespaces
    const { data } = await supabase
      .from('memory_namespaces')
      .select('*')
      .or(`owner_id.eq.${this.userId},scope.eq.public`);

    if (!data) return [];

    return data.map((ns) => ({
      id: ns.id,
      name: ns.name,
      scope: ns.scope,
      ownerId: ns.owner_id,
      organizationId: ns.organization_id,
      channels: ns.channels || ['episodic', 'semantic'],
      retentionPolicy: ns.retention_policy || {
        maxMemories: 0,
        maxAgeDays: 0,
        archiveThreshold: 2,
        deleteThreshold: 1,
        consolidationIntervalHours: 0,
      },
      acl: ns.acl || [],
      metadata: ns.metadata,
      createdAt: new Date(ns.created_at),
    }));
  }

  /**
   * Get provenance chain for a memory.
   */
  async getProvenance(memoryId: string): Promise<ProvenanceRecord | null> {
    const supabase = createServerClient();

    const { data: memory } = await supabase
      .from('memories')
      .select('id, user_id, namespace, source, tags, created_at')
      .eq('id', memoryId)
      .single();

    if (!memory) return null;

    // Get operation history
    const { data: operations } = await supabase
      .from('memory_operations_log')
      .select('operation_type, operator_id, created_at, details')
      .eq('memory_id', memoryId)
      .order('created_at', { ascending: true })
      .limit(50);

    const sharedTo = (memory.tags || [])
      .filter((t: string) => t.startsWith('shared:'))
      .map((t: string) => t.replace('shared:', ''));

    return {
      memoryId,
      originNamespace: memory.namespace || 'default',
      createdBy: memory.user_id,
      contributors: [memory.user_id],
      sharedTo,
      operations: (operations || []).map((op) => ({
        type: op.operation_type,
        operator: op.operator_id,
        timestamp: new Date(op.created_at),
        details: op.details,
      })),
    };
  }

  // ==========================================
  // Private Methods
  // ==========================================

  private async checkAccess(
    namespaceId: string,
    operatorId: string,
    requiredLevel: AccessLevel
  ): Promise<boolean> {
    const supabase = createServerClient();

    const { data: ns } = await supabase
      .from('memory_namespaces')
      .select('owner_id, scope, acl')
      .eq('id', namespaceId)
      .single();

    if (!ns) {
      // Namespace doesn't exist → allow for default namespace
      return namespaceId === 'default';
    }

    // Owner always has full access
    if (ns.owner_id === operatorId) return true;

    // Public namespaces: read access for everyone
    if (ns.scope === 'public' && requiredLevel === 'read') return true;

    // Check ACL
    const acl = (ns.acl || []) as AccessControlEntry[];
    const now = new Date();

    for (const entry of acl) {
      if (entry.expiresAt && new Date(entry.expiresAt) < now) continue;

      const levelHierarchy: Record<AccessLevel, number> = {
        read: 1,
        write: 2,
        admin: 3,
      };

      if (
        entry.subject === operatorId &&
        levelHierarchy[entry.level] >= levelHierarchy[requiredLevel]
      ) {
        return true;
      }
    }

    return false;
  }

  private async recordOperation(op: MemoryOperation): Promise<void> {
    const supabase = createServerClient();

    // Fire-and-forget logging
    Promise.resolve(
      supabase.from('memory_operations_log').insert({
        operation_id: op.operationId,
        namespace_id: op.namespaceId,
        channel: op.channel,
        operation_type: op.type,
        operator_id: op.operatorId,
        success: op.result?.success ?? false,
        latency_ms: op.result?.latencyMs ?? 0,
        details: JSON.stringify({
          payload_summary: Object.keys(op.payload),
          error: op.result?.error,
        }),
        created_at: op.timestamp.toISOString(),
      })
    ).catch(() => {});
  }
}

/**
 * Factory function for Memory Broker.
 */
export function createMemoryBroker(userId: string): MemoryBroker {
  return new MemoryBroker(userId);
}

// ============================================
// Predefined Namespace Templates
// ============================================

export const NAMESPACE_TEMPLATES = {
  /** Personal memory space (default) */
  personal: {
    name: 'Personal',
    scope: 'private' as NamespaceScope,
    channels: ['episodic', 'semantic', 'procedural', 'profile'] as ChannelType[],
    retentionPolicy: {
      maxMemories: 0,
      maxAgeDays: 0,
      archiveThreshold: 2,
      deleteThreshold: 1,
      consolidationIntervalHours: 24,
    },
    acl: [],
  },

  /** Team shared knowledge base */
  teamKnowledge: {
    name: 'Team Knowledge',
    scope: 'shared' as NamespaceScope,
    channels: ['semantic', 'procedural'] as ChannelType[],
    retentionPolicy: {
      maxMemories: 10000,
      maxAgeDays: 365,
      archiveThreshold: 3,
      deleteThreshold: 1,
      consolidationIntervalHours: 168, // weekly
    },
    acl: [],
  },

  /** Organization-wide public knowledge */
  orgWiki: {
    name: 'Organization Wiki',
    scope: 'public' as NamespaceScope,
    channels: ['semantic'] as ChannelType[],
    retentionPolicy: {
      maxMemories: 50000,
      maxAgeDays: 0,
      archiveThreshold: 2,
      deleteThreshold: 1,
      consolidationIntervalHours: 0,
    },
    acl: [],
  },
};
