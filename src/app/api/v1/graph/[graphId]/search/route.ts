/**
 * Graph Search API
 *
 * GET /api/v1/graph/:graphId/search - Search entities in graph
 */

import { NextRequest, NextResponse } from 'next/server';
import { hasApiScope, validateApiKey } from '@/lib/auth/api-key';
import { createServerClient } from '@/lib/supabase';
import { createKnowledgeGraphStore } from '@/lib/graph/graphrag';
import { boundedInt } from '@/lib/parse-params';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ graphId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }
    if (!hasApiScope(auth.scopes, 'graph:read')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires graph:read scope' },
        { status: 403 }
      );
    }

    const { graphId } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
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
