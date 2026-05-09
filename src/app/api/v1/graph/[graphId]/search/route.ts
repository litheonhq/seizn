/**
 * Graph Search API
 *
 * GET /api/v1/graph/:graphId/search - Search entities in graph
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiScope } from '@/lib/auth/api-scope';
import { createServerClient } from '@/lib/supabase';
import { createKnowledgeGraphStore } from '@/lib/graph/graphrag';
import { boundedInt } from '@/lib/parse-params';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ graphId: string }>;
}

const MAX_QUERY_LENGTH = 256;

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiScope(request, 'graph:read');
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { graphId } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.slice(0, MAX_QUERY_LENGTH) ?? null;
    const type = searchParams.get('type');
    const limit = boundedInt(searchParams.get('limit'), 20, 1, 100);

    if (!query) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Query parameter q is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify graph access
    const { data: graph } = await supabase
      .from('knowledge_graphs')
      .select('id')
      .eq('id', graphId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!graph) {
      return NextResponse.json({ error: 'Not Found', message: 'Graph not found' }, { status: 404 });
    }

    // Search entities
    const store = createKnowledgeGraphStore();
    const entities = await store.searchEntities(graphId, query, limit);

    // Filter by type if specified
    const filteredEntities = type
      ? entities.filter((e) => e.type === type)
      : entities;

    return NextResponse.json({
      query,
      entities: filteredEntities.map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        description: e.description,
        aliases: e.aliases,
        confidence: e.confidence,
        created_at: e.createdAt,
      })),
      count: filteredEntities.length,
    });
  } catch (error) {
    logServerError('[GraphSearch] GET error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
