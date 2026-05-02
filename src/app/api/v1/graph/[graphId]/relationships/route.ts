/**
 * Graph Relationships API
 *
 * GET /api/v1/graph/:graphId/relationships - List relationships in a graph
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiScope } from '@/lib/auth/api-scope';
import { boundedInt } from '@/lib/parse-params';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ graphId: string }>;
}

interface RelationshipEntityRef {
  id: string;
  name: string;
  type: string;
}

interface GraphRelationshipRow {
  id: string;
  type: string;
  label: string | null;
  properties: Record<string, unknown> | null;
  weight: number | null;
  confidence: number | null;
  source_document: string | null;
  source_entity?: RelationshipEntityRef | null;
  target_entity?: RelationshipEntityRef | null;
  created_at: string;
  updated_at?: string | null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiScope(request, 'graph:read');
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

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
      .from('graph_relationships')
      .select(
        '*, source_entity:graph_entities!source_entity_id(id, name, type), target_entity:graph_entities!target_entity_id(id, name, type)',
        { count: 'exact' }
      )
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

    const relationships = (data || []) as GraphRelationshipRow[];

    return NextResponse.json({
      relationships: relationships.map((r) => ({
        id: r.id,
        type: r.type,
        label: r.label,
        properties: r.properties,
        weight: r.weight,
        confidence: r.confidence,
        source_document: r.source_document,
        source_entity: r.source_entity
          ? { id: r.source_entity.id, name: r.source_entity.name, type: r.source_entity.type }
          : null,
        target_entity: r.target_entity
          ? { id: r.target_entity.id, name: r.target_entity.name, type: r.target_entity.type }
          : null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      pagination: {
        total: count,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    logServerError('[GraphRelationships] GET error', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
