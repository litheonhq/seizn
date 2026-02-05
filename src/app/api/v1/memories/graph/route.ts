/**
 * GraphRAG Memory API
 *
 * GET /api/v1/memories/graph - Retrieve memories with GraphRAG augmentation
 * POST /api/v1/memories/graph/rebuild - Rebuild graph edges
 * GET /api/v1/memories/graph/stats - Get graph statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  createMemoryGraphConnector,
  type MemoryGraphConfig,
} from '@/lib/memory/graphrag-connector';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');

    const config: MemoryGraphConfig = {
      userId: session.user.id,
      namespace: searchParams.get('namespace') || undefined,
    };

    const connector = createMemoryGraphConnector(config);

    // Get graph statistics
    if (type === 'stats') {
      const stats = await connector.getGraphStats();
      return NextResponse.json({ stats });
    }

    // Get related memories for a specific memory
    const memoryId = searchParams.get('memoryId');
    if (memoryId) {
      const maxDepth = parseInt(searchParams.get('maxDepth') || '2', 10);
      const related = await connector.findRelatedMemories(memoryId, maxDepth);
      return NextResponse.json({ related });
    }

    // GraphRAG retrieval
    const query = searchParams.get('query');
    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter required' },
        { status: 400 }
      );
    }

    const result = await connector.retrieve(query, {
      maxDepth: parseInt(searchParams.get('maxDepth') || '2', 10),
      topK: parseInt(searchParams.get('limit') || '10', 10),
      vectorWeight: parseFloat(searchParams.get('vectorWeight') || '0.5'),
      graphWeight: parseFloat(searchParams.get('graphWeight') || '0.5'),
      includeEntityContext: searchParams.get('includeEntities') === 'true',
    });

    return NextResponse.json({
      memories: result.memories,
      entities: result.entities,
      relations: result.relations,
      edges: result.edges,
      latencyMs: result.processingTimeMs,
    });
  } catch (error) {
    console.error('GraphRAG memory error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve memories' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, namespace, batchSize } = body;

    const config: MemoryGraphConfig = {
      userId: session.user.id,
      namespace,
      autoExtract: true,
      autoCreateEdges: true,
    };

    const connector = createMemoryGraphConnector(config);

    switch (action) {
      case 'rebuild': {
        // Rebuild graph edges from existing memories
        const result = await connector.rebuildGraphEdges(batchSize || 100);
        return NextResponse.json({
          success: true,
          ...result,
        });
      }

      case 'process': {
        // Process a specific memory
        const { memoryId, content } = body;
        if (!memoryId || !content) {
          return NextResponse.json(
            { error: 'memoryId and content are required' },
            { status: 400 }
          );
        }

        const result = await connector.processMemory(memoryId, content);
        return NextResponse.json({
          success: true,
          entities: result.entities.length,
          relations: result.relations.length,
          edges: result.edges.length,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('GraphRAG memory action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    );
  }
}
