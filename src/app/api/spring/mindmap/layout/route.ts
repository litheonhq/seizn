/**
 * MindMap API - Layout Route
 *
 * POST /api/spring/mindmap/layout - Request layout calculation server-side
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import type { MindMapNode, MindMapEdge } from '@/lib/spring/memory-v3/types';

// =============================================================================
// Types
// =============================================================================

type LayoutAlgorithm = 'elk' | 'force' | 'hierarchical';

interface LayoutRequest {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  algorithm: LayoutAlgorithm;
}

interface NodePosition {
  x: number;
  y: number;
}

interface LayoutResponse {
  positions: Record<string, NodePosition>;
  algorithm: LayoutAlgorithm;
  computeTimeMs: number;
}

// =============================================================================
// Layout Algorithms
// =============================================================================

/**
 * Simple force-directed layout implementation
 * Uses basic physics simulation with repulsion and attraction
 */
function forceDirectedLayout(
  nodes: MindMapNode[],
  edges: MindMapEdge[]
): Record<string, NodePosition> {
  const positions: Record<string, NodePosition> = {};
  const velocities: Record<string, { vx: number; vy: number }> = {};

  // Initialize positions randomly in a bounded area
  const width = 1000;
  const height = 800;

  for (const node of nodes) {
    positions[node.id] = {
      x: Math.random() * width - width / 2,
      y: Math.random() * height - height / 2,
    };
    velocities[node.id] = { vx: 0, vy: 0 };
  }

  // Build adjacency map for efficient edge lookup
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.sourceId)?.add(edge.targetId);
    adjacency.get(edge.targetId)?.add(edge.sourceId);
  }

  // Physics constants
  const repulsionStrength = 5000;
  const attractionStrength = 0.01;
  const damping = 0.9;
  const iterations = 100;

  for (let iter = 0; iter < iterations; iter++) {
    // Apply repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        const posA = positions[nodeA.id];
        const posB = positions[nodeB.id];

        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // Coulomb's law: F = k / d^2
        const force = repulsionStrength / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        velocities[nodeA.id].vx -= fx;
        velocities[nodeA.id].vy -= fy;
        velocities[nodeB.id].vx += fx;
        velocities[nodeB.id].vy += fy;
      }
    }

    // Apply attraction along edges (Hooke's law)
    for (const edge of edges) {
      const posSource = positions[edge.sourceId];
      const posTarget = positions[edge.targetId];

      if (!posSource || !posTarget) continue;

      const dx = posTarget.x - posSource.x;
      const dy = posTarget.y - posSource.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;

      // Hooke's law: F = k * d
      const force = attractionStrength * distance * (edge.weight || 1);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      velocities[edge.sourceId].vx += fx;
      velocities[edge.sourceId].vy += fy;
      velocities[edge.targetId].vx -= fx;
      velocities[edge.targetId].vy -= fy;
    }

    // Update positions and apply damping
    for (const node of nodes) {
      const vel = velocities[node.id];
      const pos = positions[node.id];

      vel.vx *= damping;
      vel.vy *= damping;

      pos.x += vel.vx;
      pos.y += vel.vy;

      // Constrain to bounds
      pos.x = Math.max(-width, Math.min(width, pos.x));
      pos.y = Math.max(-height, Math.min(height, pos.y));
    }
  }

  return positions;
}

/**
 * Hierarchical layout implementation
 * Organizes nodes in levels based on graph structure
 */
function hierarchicalLayout(
  nodes: MindMapNode[],
  edges: MindMapEdge[]
): Record<string, NodePosition> {
  const positions: Record<string, NodePosition> = {};

  // Build adjacency lists
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const node of nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const edge of edges) {
    outgoing.get(edge.sourceId)?.push(edge.targetId);
    incoming.get(edge.targetId)?.push(edge.sourceId);
  }

  // Find root nodes (nodes with no incoming edges or minimum incoming)
  const roots: string[] = [];

  for (const node of nodes) {
    const incomingEdges = incoming.get(node.id) || [];
    if (incomingEdges.length === 0) {
      roots.push(node.id);
    }
  }

  // If no roots found, use nodes with minimum incoming edges
  if (roots.length === 0 && nodes.length > 0) {
    let minIncoming = Infinity;
    for (const node of nodes) {
      const count = incoming.get(node.id)?.length || 0;
      if (count < minIncoming) {
        minIncoming = count;
      }
    }
    for (const node of nodes) {
      if ((incoming.get(node.id)?.length || 0) === minIncoming) {
        roots.push(node.id);
      }
    }
  }

  // Assign levels using BFS
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue = roots.map((id) => ({ id, level: 0 }));

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;

    if (visited.has(id)) continue;
    visited.add(id);
    levels.set(id, level);

    const children = outgoing.get(id) || [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        queue.push({ id: childId, level: level + 1 });
      }
    }
  }

  // Add any unvisited nodes at level 0
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0);
    }
  }

  // Group nodes by level
  const nodesByLevel = new Map<number, string[]>();
  for (const [nodeId, level] of levels) {
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, []);
    }
    nodesByLevel.get(level)!.push(nodeId);
  }

  // Position nodes
  const levelHeight = 150;
  const nodeSpacing = 200;

  for (const [level, levelNodes] of nodesByLevel) {
    const y = level * levelHeight;
    const totalWidth = (levelNodes.length - 1) * nodeSpacing;
    const startX = -totalWidth / 2;

    for (let i = 0; i < levelNodes.length; i++) {
      positions[levelNodes[i]] = {
        x: startX + i * nodeSpacing,
        y,
      };
    }
  }

  return positions;
}

/**
 * ELK-style layout implementation
 * Combines hierarchical structure with orthogonal edge routing
 * This is a simplified version - real ELK would use the elkjs library
 */
function elkLayout(
  nodes: MindMapNode[],
  edges: MindMapEdge[]
): Record<string, NodePosition> {
  // Start with hierarchical layout as base
  const positions = hierarchicalLayout(nodes, edges);

  // Apply some adjustments to reduce edge crossings
  // Build adjacency for optimization
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.sourceId)?.add(edge.targetId);
    adjacency.get(edge.targetId)?.add(edge.sourceId);
  }

  // Group nodes by Y position (level)
  const nodesByLevel = new Map<number, string[]>();
  for (const node of nodes) {
    const y = Math.round(positions[node.id].y / 100) * 100;
    if (!nodesByLevel.has(y)) {
      nodesByLevel.set(y, []);
    }
    nodesByLevel.get(y)!.push(node.id);
  }

  // For each level, reorder nodes to minimize edge crossings
  // Using a simple barycenter heuristic
  for (let iteration = 0; iteration < 5; iteration++) {
    const sortedLevels = Array.from(nodesByLevel.keys()).sort((a, b) => a - b);

    for (let levelIdx = 1; levelIdx < sortedLevels.length; levelIdx++) {
      const currentLevel = sortedLevels[levelIdx];
      const levelNodes = nodesByLevel.get(currentLevel)!;
      const previousLevel = sortedLevels[levelIdx - 1];
      const previousNodes = nodesByLevel.get(previousLevel)!;

      // Calculate barycenter for each node
      const barycenters = new Map<string, number>();

      for (const nodeId of levelNodes) {
        const neighbors = adjacency.get(nodeId) || new Set();
        const connectedPrevious = previousNodes.filter((pn) => neighbors.has(pn));

        if (connectedPrevious.length > 0) {
          const sum = connectedPrevious.reduce(
            (s, pn) => s + positions[pn].x,
            0
          );
          barycenters.set(nodeId, sum / connectedPrevious.length);
        } else {
          barycenters.set(nodeId, positions[nodeId].x);
        }
      }

      // Sort nodes by barycenter
      levelNodes.sort((a, b) => (barycenters.get(a) || 0) - (barycenters.get(b) || 0));

      // Reassign X positions
      const nodeSpacing = 200;
      const totalWidth = (levelNodes.length - 1) * nodeSpacing;
      const startX = -totalWidth / 2;

      for (let i = 0; i < levelNodes.length; i++) {
        positions[levelNodes[i]].x = startX + i * nodeSpacing;
      }
    }
  }

  return positions;
}

// =============================================================================
// POST /api/spring/mindmap/layout - Calculate Layout
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    let body: LayoutRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate required fields
    if (!body.nodes || !Array.isArray(body.nodes)) {
      return ValidationErrors.missingField('nodes');
    }

    if (!body.edges || !Array.isArray(body.edges)) {
      return ValidationErrors.missingField('edges');
    }

    if (!body.algorithm) {
      return ValidationErrors.missingField('algorithm');
    }

    // Validate algorithm
    const validAlgorithms: LayoutAlgorithm[] = ['elk', 'force', 'hierarchical'];
    if (!validAlgorithms.includes(body.algorithm)) {
      return ValidationErrors.invalidValue('algorithm', body.algorithm, validAlgorithms.join(', '));
    }

    // Validate input sizes
    const maxNodes = 500;
    const maxEdges = 2000;

    if (body.nodes.length > maxNodes) {
      return ValidationErrors.invalidField(
        'nodes',
        `Maximum ${maxNodes} nodes allowed, got ${body.nodes.length}`
      );
    }

    if (body.edges.length > maxEdges) {
      return ValidationErrors.invalidField(
        'edges',
        `Maximum ${maxEdges} edges allowed, got ${body.edges.length}`
      );
    }

    // Validate node structure
    for (let i = 0; i < body.nodes.length; i++) {
      const node = body.nodes[i];
      if (!node.id) {
        return ValidationErrors.invalidField(`nodes[${i}]`, 'missing id');
      }
    }

    // Validate edge structure
    const nodeIds = new Set(body.nodes.map((n) => n.id));
    for (let i = 0; i < body.edges.length; i++) {
      const edge = body.edges[i];
      if (!edge.sourceId) {
        return ValidationErrors.invalidField(`edges[${i}]`, 'missing sourceId');
      }
      if (!edge.targetId) {
        return ValidationErrors.invalidField(`edges[${i}]`, 'missing targetId');
      }
      if (!nodeIds.has(edge.sourceId)) {
        return ValidationErrors.invalidField(
          `edges[${i}].sourceId`,
          `references unknown node: ${edge.sourceId}`
        );
      }
      if (!nodeIds.has(edge.targetId)) {
        return ValidationErrors.invalidField(
          `edges[${i}].targetId`,
          `references unknown node: ${edge.targetId}`
        );
      }
    }

    // Calculate layout based on algorithm
    const computeStart = Date.now();
    let positions: Record<string, NodePosition>;

    switch (body.algorithm) {
      case 'force':
        positions = forceDirectedLayout(body.nodes, body.edges);
        break;
      case 'hierarchical':
        positions = hierarchicalLayout(body.nodes, body.edges);
        break;
      case 'elk':
        positions = elkLayout(body.nodes, body.edges);
        break;
      default:
        positions = forceDirectedLayout(body.nodes, body.edges);
    }

    const computeTimeMs = Date.now() - computeStart;

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/spring/mindmap/layout', method: 'POST', startTime },
      200
    );

    // Build response
    const response = NextResponse.json<LayoutResponse>(
      {
        positions,
        algorithm: body.algorithm,
        computeTimeMs,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('MindMap layout POST error:', error);
    return ServerErrors.internal('mindmap_layout');
  }
}
