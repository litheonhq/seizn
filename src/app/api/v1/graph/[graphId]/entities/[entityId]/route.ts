/**
 * Graph Entity Detail API
 *
 * GET /api/v1/graph/:graphId/entities/:entityId - Get entity with relationships
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiScope } from '@/lib/auth/api-scope';
import { getEntityExternalId } from '@/lib/graph/external-id';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ graphId: string; entityId: string }>;
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
  target_entity?: RelationshipEntityRef | null;
  source_entity?: RelationshipEntityRef | null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiScope(request, 'graph:read');
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { graphId, entityId } = await params;
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

    // Fetch the entity
    const { data: entity, error: entityError } = await supabase
      .from('graph_entities')
      .select('*')
      .eq('id', entityId)
      .eq('graph_id', graphId)
      .single();

    if (entityError || !entity) {
      return NextResponse.json({ error: 'Not Found', message: 'Entity not found' }, { status: 404 });
    }

    // Fetch outgoing relationships (entity is source)
    const { data: outgoing, error: outError } = await supabase
      .from('graph_relationships')
      .select(
        '*, target_entity:graph_entities!target_entity_id(id, name, type)'
      )
      .eq('graph_id', graphId)
      .eq('source_entity_id', entityId);

    if (outError) {
      return NextResponse.json(
        { error: 'Database Error', message: outError.message },
        { status: 500 }
      );
    }

    // Fetch incoming relationships (entity is target)
    const { data: incoming, error: inError } = await supabase
      .from('graph_relationships')
      .select(
        '*, source_entity:graph_entities!source_entity_id(id, name, type)'
      )
      .eq('graph_id', graphId)
      .eq('target_entity_id', entityId);

    if (inError) {
      return NextResponse.json(
        { error: 'Database Error', message: inError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      entity: {
        id: entity.id,
        type: entity.type,
        name: entity.name,
        external_id: getEntityExternalId(entity),
        description: entity.description,
        aliases: entity.aliases,
        properties: entity.properties,
        source_documents: entity.source_documents,
        confidence: entity.confidence,
        created_at: entity.created_at,
        updated_at: entity.updated_at,
      },
      relationships: {
        outgoing: ((outgoing as GraphRelationshipRow[] | null) || []).map((r) => ({
          id: r.id,
          type: r.type,
          label: r.label,
          properties: r.properties,
          weight: r.weight,
          confidence: r.confidence,
          source_document: r.source_document,
          target_entity: r.target_entity
            ? { id: r.target_entity.id, name: r.target_entity.name, type: r.target_entity.type }
            : null,
        })),
        incoming: ((incoming as GraphRelationshipRow[] | null) || []).map((r) => ({
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
        })),
      },
    });
  } catch (error) {
    logServerError('[GraphEntity] GET error', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
