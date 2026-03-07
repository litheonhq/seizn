/**
 * Graph Context API
 *
 * POST /api/v1/graph/:graphId/context - Build graph context for query
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { createServerClient } from '@/lib/supabase';
import { createGraphRAGRetriever } from '@/lib/graph/graphrag';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ graphId: string }>;
}

interface ContextRequest {
  query: string;
  max_entities?: number;
  max_depth?: number;
  include_relationships?: boolean;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { graphId } = await params;
    const body = (await request.json()) as ContextRequest;

    if (!body.query) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'query is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify graph access
    const { data: graph } = await supabase
      .from('knowledge_graphs')
      .select('id, name')
      .eq('id', graphId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!graph) {
      return NextResponse.json({ error: 'Not Found', message: 'Graph not found' }, { status: 404 });
    }

    // Build context
    const retriever = createGraphRAGRetriever();
    const context = await retriever.buildContext(graphId, body.query, {
      maxEntities: body.max_entities || 10,
      maxDepth: body.max_depth || 2,
      includeRelationships: body.include_relationships ?? true,
    });

    return NextResponse.json({
      graph_id: graphId,
      graph_name: graph.name,
      query: body.query,
      context: {
        entities: context.entities.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.name,
          description: e.description,
          confidence: e.confidence,
        })),
        relationships: context.relationships.map((r) => ({
          id: r.id,
          source_entity_id: r.sourceEntityId,
          target_entity_id: r.targetEntityId,
          type: r.type,
          label: r.label,
        })),
        subgraph_description: context.subgraph,
        relevance_score: context.relevanceScore,
      },
    });
  } catch (error) {
    logServerError('[GraphContext] POST error', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
