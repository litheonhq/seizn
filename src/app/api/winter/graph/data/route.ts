import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors, ValidationErrors } from '@/lib/api-error';
import {
  buildPermissionGraph,
  buildFederatedGraph,
  filterGraphData,
  type GraphQueryOptions,
  type GraphFilter,
} from '@/lib/winter/graph';

/**
 * GET /api/winter/graph/data
 *
 * Retrieve graph data for visualization.
 *
 * Query parameters:
 * - type: 'permission' | 'federated' | 'hybrid' (default: 'permission')
 * - nodeTypes: comma-separated list of node types to include
 * - edgeTypes: comma-separated list of edge types to include
 * - status: comma-separated list of statuses to filter
 * - permissionLevels: comma-separated list of permission levels
 * - search: search term for node labels/descriptions
 * - maxDepth: maximum depth from root
 * - includePermissions: whether to include permissions (default: true)
 * - includeMetadata: whether to include metadata (default: true)
 * - limit: max number of nodes (default: 100)
 * - offset: pagination offset (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const graphType = (searchParams.get('type') || 'permission') as
      | 'permission'
      | 'federated'
      | 'hybrid';

    const filter: GraphFilter = {};

    // Parse node types
    const nodeTypesParam = searchParams.get('nodeTypes');
    if (nodeTypesParam) {
      filter.nodeTypes = nodeTypesParam.split(',') as GraphFilter['nodeTypes'];
    }

    // Parse edge types
    const edgeTypesParam = searchParams.get('edgeTypes');
    if (edgeTypesParam) {
      filter.edgeTypes = edgeTypesParam.split(',') as GraphFilter['edgeTypes'];
    }

    // Parse status
    const statusParam = searchParams.get('status');
    if (statusParam) {
      filter.status = statusParam.split(',') as GraphFilter['status'];
    }

    // Parse permission levels
    const permissionLevelsParam = searchParams.get('permissionLevels');
    if (permissionLevelsParam) {
      filter.permissionLevels = permissionLevelsParam.split(',') as GraphFilter['permissionLevels'];
    }

    // Parse search
    const search = searchParams.get('search');
    if (search) {
      filter.search = search;
    }

    // Parse max depth
    const maxDepthParam = searchParams.get('maxDepth');
    if (maxDepthParam) {
      filter.maxDepth = parseInt(maxDepthParam, 10);
    }

    // Build query options
    const options: GraphQueryOptions = {
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      includePermissions: searchParams.get('includePermissions') !== 'false',
      includeMetadata: searchParams.get('includeMetadata') !== 'false',
      limit: parseInt(searchParams.get('limit') || '100', 10),
      offset: parseInt(searchParams.get('offset') || '0', 10),
    };

    // Build graph based on type
    let graphData;
    const userId = authResult.userId;

    switch (graphType) {
      case 'permission':
        graphData = await buildPermissionGraph(userId, options);
        break;
      case 'federated':
        graphData = await buildFederatedGraph(userId, options);
        break;
      case 'hybrid': {
        // Build both and merge
        const permGraph = await buildPermissionGraph(userId, options);
        const fedGraph = await buildFederatedGraph(userId, options);

        // Merge nodes (avoiding duplicates by ID)
        const nodeMap = new Map(permGraph.nodes.map((n) => [n.id, n]));
        fedGraph.nodes.forEach((n) => {
          if (!nodeMap.has(n.id)) {
            nodeMap.set(n.id, n);
          }
        });

        // Merge edges
        const edgeMap = new Map(permGraph.edges.map((e) => [e.id, e]));
        fedGraph.edges.forEach((e) => {
          if (!edgeMap.has(e.id)) {
            edgeMap.set(e.id, e);
          }
        });

        graphData = {
          nodes: Array.from(nodeMap.values()),
          edges: Array.from(edgeMap.values()),
          metadata: {
            ...permGraph.metadata,
            type: 'hybrid' as const,
            stats: {
              nodeCount: nodeMap.size,
              edgeCount: edgeMap.size,
              nodesByType: {
                ...permGraph.metadata.stats.nodesByType,
                ...fedGraph.metadata.stats.nodesByType,
              },
              edgesByType: {
                ...permGraph.metadata.stats.edgesByType,
                ...fedGraph.metadata.stats.edgesByType,
              },
            },
          },
        };
        break;
      }
      default:
        return ValidationErrors.invalidField('type', 'Must be permission, federated, or hybrid');
    }

    // Apply filters
    if (options.filter) {
      graphData = filterGraphData(graphData, options.filter);
    }

    // Apply pagination to nodes
    const totalNodes = graphData.nodes.length;
    const paginatedNodes = graphData.nodes.slice(
      options.offset || 0,
      (options.offset || 0) + (options.limit || 100)
    );

    // Filter edges to only include those between visible nodes
    const visibleNodeIds = new Set(paginatedNodes.map((n) => n.id));
    const paginatedEdges = graphData.edges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );

    return NextResponse.json({
      success: true,
      data: {
        nodes: paginatedNodes,
        edges: paginatedEdges,
        metadata: {
          ...graphData.metadata,
          stats: {
            ...graphData.metadata.stats,
            nodeCount: paginatedNodes.length,
            edgeCount: paginatedEdges.length,
          },
        },
      },
      pagination: {
        total: totalNodes,
        limit: options.limit || 100,
        offset: options.offset || 0,
        hasMore: (options.offset || 0) + paginatedNodes.length < totalNodes,
      },
    });
  } catch (error) {
    console.error('Graph data error:', error);
    return ServerErrors.internal('graph_data');
  }
}
