/**
 * MindMap API - Main Route
 *
 * GET /api/spring/mindmap - Get graph slice for visualization
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createMemoryV3Service } from '@/lib/spring/memory-v3/service';
import type {
  MindMapNode,
  MindMapEdge,
  NoteType,
  NoteStatus,
  PrivacyClass,
  NoteScope,
  MemoryNote,
  MemoryEdge,
  Entity,
} from '@/lib/spring/memory-v3/types';

// =============================================================================
// Types
// =============================================================================

interface MindMapStats {
  totalNodes: number;
  totalEdges: number;
  clusters: number;
}

interface MindMapResponse {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  stats: MindMapStats;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse time filter string into a Date
 * Supports formats like: 7d, 30d, 1y, 3m
 */
function parseTimeFilter(since: string): Date {
  const match = since.match(/^(\d+)([dDwWmMyY])$/);
  if (!match) {
    throw new Error(`Invalid time filter format: ${since}. Use formats like 7d, 30d, 3m, 1y`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case 'd':
      now.setDate(now.getDate() - value);
      break;
    case 'w':
      now.setDate(now.getDate() - value * 7);
      break;
    case 'm':
      now.setMonth(now.getMonth() - value);
      break;
    case 'y':
      now.setFullYear(now.getFullYear() - value);
      break;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }

  return now;
}

/**
 * Convert a MemoryNote to a MindMapNode
 */
function noteToMindMapNode(note: MemoryNote, depth: number): MindMapNode {
  return {
    id: note.id,
    type: 'note',
    label: note.content.substring(0, 100) + (note.content.length > 100 ? '...' : ''),
    content: note.content,
    note: note,
    depth,
    relevance: note.salience?.score,
  };
}

/**
 * Convert a MemoryEdge to a MindMapEdge
 */
function edgeToMindMapEdge(edge: MemoryEdge): MindMapEdge {
  return {
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    type: edge.type,
    weight: edge.weight,
    label: edge.type.replace(/_/g, ' '),
  };
}

/**
 * Create entity nodes from note entity mentions
 */
function extractEntityNodes(notes: MemoryNote[]): MindMapNode[] {
  const entityMap = new Map<string, { entity: Entity; depth: number }>();

  for (const note of notes) {
    if (note.entityMentions) {
      for (const mention of note.entityMentions) {
        if (mention.entity && !entityMap.has(mention.entityId)) {
          entityMap.set(mention.entityId, {
            entity: mention.entity,
            depth: 0, // Entities are at root level
          });
        }
      }
    }
  }

  return Array.from(entityMap.values()).map(({ entity, depth }) => ({
    id: entity.id,
    type: 'entity' as const,
    label: entity.name,
    entity,
    depth,
    relevance: entity.mentionCount ? Math.min(entity.mentionCount / 10, 1) : undefined,
  }));
}

/**
 * Create edges between notes and their mentioned entities
 */
function createEntityEdges(notes: MemoryNote[]): MindMapEdge[] {
  const edges: MindMapEdge[] = [];

  for (const note of notes) {
    if (note.entityMentions) {
      for (const mention of note.entityMentions) {
        edges.push({
          sourceId: note.id,
          targetId: mention.entityId,
          type: 'mentions_entity',
          weight: mention.confidence || 0.8,
          label: 'mentions',
        });
      }
    }
  }

  return edges;
}

/**
 * Identify and group notes into clusters
 */
function identifyClusters(
  notes: MemoryNote[],
  edges: MemoryEdge[]
): Map<string, { id: string; name: string; noteIds: string[] }> {
  const clusters = new Map<string, { id: string; name: string; noteIds: string[] }>();

  // Find cluster edges
  const clusterEdges = edges.filter((e) => e.type === 'part_of_cluster');

  for (const edge of clusterEdges) {
    const clusterId = edge.targetId;
    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, {
        id: clusterId,
        name: `Cluster ${clusterId.substring(0, 8)}`,
        noteIds: [],
      });
    }
    clusters.get(clusterId)!.noteIds.push(edge.sourceId);
  }

  return clusters;
}

// =============================================================================
// GET /api/spring/mindmap - Get Graph Slice
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const scope = searchParams.get('scope') as NoteScope | null;
    const rootId = searchParams.get('rootId');
    const depthParam = searchParams.get('depth');
    const typesParam = searchParams.get('types');
    const statusParam = searchParams.get('status');
    const privacyClassParam = searchParams.get('privacyClass');
    const sinceParam = searchParams.get('since');
    const limitParam = searchParams.get('limit');

    // Validate and parse parameters
    const depth = depthParam ? Math.min(Math.max(parseInt(depthParam, 10), 1), 5) : 3;
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 500) : 100;

    // Validate scope if provided
    const validScopes: NoteScope[] = ['user', 'workspace', 'org', 'session', 'agent'];
    if (scope && !validScopes.includes(scope)) {
      return ValidationErrors.invalidValue('scope', scope, validScopes.join(', '));
    }

    // Parse types filter
    let types: NoteType[] | undefined;
    if (typesParam) {
      types = typesParam.split(',') as NoteType[];
      const validTypes: NoteType[] = ['fact', 'preference', 'instruction', 'episode', 'procedure', 'relationship'];
      for (const t of types) {
        if (!validTypes.includes(t)) {
          return ValidationErrors.invalidValue('types', t, validTypes.join(', '));
        }
      }
    }

    // Parse status filter
    let statuses: NoteStatus[] | undefined;
    if (statusParam) {
      statuses = statusParam.split(',') as NoteStatus[];
      const validStatuses: NoteStatus[] = ['candidate', 'active', 'superseded', 'contradicted', 'deleted'];
      for (const s of statuses) {
        if (!validStatuses.includes(s)) {
          return ValidationErrors.invalidValue('status', s, validStatuses.join(', '));
        }
      }
    }

    // Parse privacy class filter
    let privacyClasses: PrivacyClass[] | undefined;
    if (privacyClassParam) {
      privacyClasses = privacyClassParam.split(',') as PrivacyClass[];
      const validPrivacy: PrivacyClass[] = ['public', 'internal', 'confidential', 'restricted'];
      for (const p of privacyClasses) {
        if (!validPrivacy.includes(p)) {
          return ValidationErrors.invalidValue('privacyClass', p, validPrivacy.join(', '));
        }
      }
    }

    // Parse time filter
    let createdAfter: Date | undefined;
    if (sinceParam) {
      try {
        createdAfter = parseTimeFilter(sinceParam);
      } catch (error) {
        return ValidationErrors.invalidField('since', (error as Error).message);
      }
    }

    // Initialize service
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);

    // Build the graph
    const nodeMap = new Map<string, MindMapNode>();
    const edgeList: MindMapEdge[] = [];
    const processedNoteIds = new Set<string>();

    // If rootId is provided, start from that node and expand outward
    if (rootId) {
      // Verify the root note exists and is accessible
      const rootNote = await service.getNote(rootId);
      if (!rootNote) {
        return ValidationErrors.invalidField('rootId', `Note not found: ${rootId}`);
      }

      if (rootNote.userId !== userId) {
        return ValidationErrors.invalidField('rootId', 'You do not have access to this note');
      }

      // Add root node
      nodeMap.set(rootId, noteToMindMapNode(rootNote, 0));
      processedNoteIds.add(rootId);

      // Traverse graph to specified depth
      let currentLevel = [rootId];
      for (let currentDepth = 1; currentDepth <= depth && currentLevel.length > 0; currentDepth++) {
        const nextLevel: string[] = [];

        for (const noteId of currentLevel) {
          // Get edges connected to this note
          const edges = await service.getEdges({ noteId });

          for (const edge of edges) {
            // Add edge to list (avoid duplicates)
            const edgeKey = `${edge.sourceId}-${edge.targetId}-${edge.type}`;
            if (!edgeList.some((e) => `${e.sourceId}-${e.targetId}-${e.type}` === edgeKey)) {
              edgeList.push(edgeToMindMapEdge(edge));
            }

            // Get connected node
            const connectedId = edge.sourceId === noteId ? edge.targetId : edge.sourceId;

            if (!processedNoteIds.has(connectedId)) {
              processedNoteIds.add(connectedId);
              const connectedNote = await service.getNote(connectedId);

              if (connectedNote && connectedNote.userId === userId) {
                // Apply filters
                if (types && !types.includes(connectedNote.type)) continue;
                if (statuses && !statuses.includes(connectedNote.status)) continue;
                if (privacyClasses && !privacyClasses.includes(connectedNote.privacyClass)) continue;
                if (createdAfter && connectedNote.createdAt < createdAfter) continue;

                nodeMap.set(connectedId, noteToMindMapNode(connectedNote, currentDepth));
                nextLevel.push(connectedId);
              }
            }
          }

          // Limit total nodes
          if (nodeMap.size >= limit) break;
        }

        currentLevel = nextLevel;
        if (nodeMap.size >= limit) break;
      }
    } else {
      // No root specified - fetch notes based on filters
      const query = {
        userId,
        types,
        statuses: statuses || ['active' as NoteStatus],
        privacyClasses,
        createdAfter,
        limit,
        sortBy: 'salience' as const,
        sortOrder: 'desc' as const,
        includeEntityMentions: true,
      };

      // Filter by scope if provided
      if (scope) {
        switch (scope) {
          case 'user':
            // Already filtered by userId
            break;
          case 'workspace':
            const workspaceId = searchParams.get('workspaceId');
            if (workspaceId) {
              Object.assign(query, { workspaceId });
            }
            break;
          case 'org':
            const orgId = searchParams.get('orgId');
            if (orgId) {
              Object.assign(query, { orgId });
            }
            break;
        }
      }

      const { notes } = await service.listNotes(query);

      // Add all notes as nodes
      for (const note of notes) {
        nodeMap.set(note.id, noteToMindMapNode(note, 0));
        processedNoteIds.add(note.id);
      }

      // Fetch edges between these notes
      for (const note of notes) {
        const edges = await service.getEdges({ noteId: note.id });

        for (const edge of edges) {
          // Only include edges where both endpoints are in our node set
          if (processedNoteIds.has(edge.sourceId) && processedNoteIds.has(edge.targetId)) {
            const edgeKey = `${edge.sourceId}-${edge.targetId}-${edge.type}`;
            if (!edgeList.some((e) => `${e.sourceId}-${e.targetId}-${e.type}` === edgeKey)) {
              edgeList.push(edgeToMindMapEdge(edge));
            }
          }
        }
      }

      // Extract entity nodes and edges
      const entityNodes = extractEntityNodes(notes);
      for (const entityNode of entityNodes) {
        nodeMap.set(entityNode.id, entityNode);
      }

      const entityEdges = createEntityEdges(notes);
      for (const entityEdge of entityEdges) {
        // Only add if entity node exists
        if (nodeMap.has(entityEdge.targetId)) {
          edgeList.push(entityEdge);
        }
      }
    }

    // Convert maps to arrays
    const nodes = Array.from(nodeMap.values());
    const edges = edgeList;

    // Identify clusters
    const memoryEdges = await Promise.all(
      Array.from(processedNoteIds).map((id) => service.getEdges({ noteId: id }))
    );
    const allEdges = memoryEdges.flat();
    const clusters = identifyClusters(
      nodes.filter((n) => n.type === 'note').map((n) => n.note!),
      allEdges
    );

    // Build stats
    const stats: MindMapStats = {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      clusters: clusters.size,
    };

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/spring/mindmap', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json<MindMapResponse>(
      {
        nodes,
        edges,
        stats,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('MindMap GET error:', error);
    return ServerErrors.internal('mindmap_get');
  }
}
