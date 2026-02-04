/**
 * Knowledge Graph API
 *
 * POST /api/v1/graph - Create knowledge graph
 * GET /api/v1/graph - List knowledge graphs
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { createKnowledgeGraphStore } from '@/lib/graph/graphrag';
import { createServerClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'name is required' },
        { status: 400 }
      );
    }

    const store = createKnowledgeGraphStore();
    const graph = await store.createGraph({
      organizationId: auth.organizationId!,
      name,
      description,
    });

    return NextResponse.json({ graph }, { status: 201 });
  } catch (error) {
    console.error('[Graph] POST error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createServerClient();

    const { data, error, count } = await supabase
      .from('knowledge_graphs')
      .select('*', { count: 'exact' })
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      graphs: (data || []).map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        entity_count: g.entity_count,
        relationship_count: g.relationship_count,
        created_at: g.created_at,
        updated_at: g.updated_at,
      })),
      pagination: {
        total: count,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('[Graph] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
