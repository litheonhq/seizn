/**
 * Graph Entities API
 *
 * GET /api/v1/graph/:graphId/entities - List entities in a graph
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { boundedInt } from '@/lib/parse-params';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ graphId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { graphId } = await params;
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

    const { searchParams } = new URL(request.url);
    const limit = boundedInt(searchParams.get('limit'), 100, 1, 1000);
    const offset = boundedInt(searchParams.get('offset'), 0, 0, 100_000);
    const typeFilter = searchParams.get('type');

    let query = supabase
      .from('graph_entities')
      .select('*', { count: 'exact' })
      .eq('graph_id', graphId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (typeFilter) {
      query = query.eq('type', typeFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      entities: (data || []).map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        description: e.description,
        aliases: e.aliases,
        properties: e.properties,
        source_documents: e.source_documents,
        confidence: e.confidence,
        created_at: e.created_at,
        updated_at: e.updated_at,
      })),
      pagination: {
        total: count,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    logServerError('[GraphEntities] GET error', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
