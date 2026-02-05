/**
 * MindMap API - Expand Route
 *
 * GET /api/spring/mindmap/expand - Expand a specific node to load its neighbors
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createMemoryV3Service } from '@/lib/spring/memory-v3/service';
import type {
  MindMapNode,
  MindMapEdge,
  MemoryNote,
  MemoryEdge,
} from '@/lib/spring/memory-v3/types';

// =============================================================================
// Types
// =============================================================================

type Direction = 'outgoing' | 'incoming' | 'both';

interface ExpandResponse {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

// =============================================================================
// Helper Functions
// =============================================================================

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
 * Filter edges based on direction relative to a node
 */
function filterEdgesByDirection(
  edges: MemoryEdge[],
  nodeId: string,
  direction: Direction
): MemoryEdge[] {
  switch (direction) {
    case 'outgoing':
      return edges.filter((e) => e.sourceId === nodeId);
    case 'incoming':
      return edges.filter((e) => e.targetId === nodeId);
    case 'both':
    default:
      return edges;
  }
}

/**
 * Get connected node ID based on direction
 */
function getConnectedNodeId(
  edge: MemoryEdge,
  originNodeId: string,
  direction: Direction
): string | null {
  switch (direction) {
    case 'outgoing':
      return edge.sourceId === originNodeId ? edge.targetId : null;
    case 'incoming':
      return edge.targetId === originNodeId ? edge.sourceId : null;
    case 'both':
      return edge.sourceId === originNodeId ? edge.targetId : edge.sourceId;
  }
}

// =============================================================================
// GET /api/spring/mindmap/expand - Expand Node
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
    const nodeId = searchParams.get('nodeId');
    const depthParam = searchParams.get('depth');
    const directionParam = searchParams.get('direction');

    // Validate required parameters
    if (!nodeId) {
      return ValidationErrors.missingField('nodeId');
    }

    // Parse and validate depth
    const depth = depthParam ? Math.min(Math.max(parseInt(depthParam, 10), 1), 3) : 1;
    if (isNaN(depth)) {
      return ValidationErrors.invalidField('depth', 'must be a positive integer');
    }

    // Parse and validate direction
    const validDirections: Direction[] = ['outgoing', 'incoming', 'both'];
    const direction: Direction = (directionParam as Direction) || 'both';
    if (!validDirections.includes(direction)) {
      return ValidationErrors.invalidValue('direction', direction, validDirections.join(', '));
    }

    // Initialize service
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);

    // Verify the starting node exists and is accessible
    const startNode = await service.getNote(nodeId);
    if (!startNode) {
      return NotFoundErrors.memory(nodeId);
    }

    if (startNode.userId !== userId) {
      return ValidationErrors.invalidField('nodeId', 'You do not have access to this note');
    }

    // Build the expanded graph
    const nodeMap = new Map<string, MindMapNode>();
    const edgeList: MindMapEdge[] = [];
    const processedNoteIds = new Set<string>();

    // Don't include the starting node in results (client already has it)
    processedNoteIds.add(nodeId);

    // Traverse graph to specified depth
    let currentLevel = [nodeId];

    for (let currentDepth = 1; currentDepth <= depth && currentLevel.length > 0; currentDepth++) {
      const nextLevel: string[] = [];

      for (const currentNodeId of currentLevel) {
        // Get edges connected to this node
        const allEdges = await service.getEdges({ noteId: currentNodeId });

        // Filter edges by direction
        const edges = filterEdgesByDirection(allEdges, currentNodeId, direction);

        for (const edge of edges) {
          // Get connected node ID based on direction
          const connectedId = getConnectedNodeId(edge, currentNodeId, direction);

          if (!connectedId) continue;

          // Add edge to list (avoid duplicates)
          const edgeKey = `${edge.sourceId}-${edge.targetId}-${edge.type}`;
          if (!edgeList.some((e) => `${e.sourceId}-${e.targetId}-${e.type}` === edgeKey)) {
            edgeList.push(edgeToMindMapEdge(edge));
          }

          // Skip if already processed
          if (processedNoteIds.has(connectedId)) continue;
          processedNoteIds.add(connectedId);

          // Get the connected note
          const connectedNote = await service.getNote(connectedId);

          if (connectedNote && connectedNote.userId === userId) {
            nodeMap.set(connectedId, noteToMindMapNode(connectedNote, currentDepth));
            nextLevel.push(connectedId);
          }
        }
      }

      currentLevel = nextLevel;
    }

    // Convert maps to arrays
    const nodes = Array.from(nodeMap.values());
    const edges = edgeList;

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/spring/mindmap/expand', method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json<ExpandResponse>(
      {
        nodes,
        edges,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('MindMap expand GET error:', error);
    return ServerErrors.internal('mindmap_expand');
  }
}
