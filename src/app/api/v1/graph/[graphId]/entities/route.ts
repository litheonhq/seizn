/**
 * Graph Entities API
 *
 * GET /api/v1/graph/:graphId/entities - List entities in a graph
 * POST /api/v1/graph/:graphId/entities - Create or upsert an entity in a graph
 */

import { NextRequest, NextResponse } from 'next/server';
import { hasApiScope, validateApiKey } from '@/lib/auth/api-key';
import {
  getEntityExternalId,
  isMissingExternalIdColumnError,
  withExternalIdProperty,
} from '@/lib/graph/external-id';
import { boundedInt } from '@/lib/parse-params';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ graphId: string }>;
}

async function hasExternalIdColumn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  const { error } = await supabase.from('graph_entities').select('external_id').limit(1);
  return !isMissingExternalIdColumnError(error);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }
    if (!hasApiScope(auth.scopes, 'graph:write')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires graph:write scope' },
        { status: 403 }
      );
    }

    const { graphId } = await params;
    const body = (await request.json()) as {
      type?: string;
      name?: string;
      external_id?: string;
      description?: string;
      aliases?: string[];
      properties?: Record<string, unknown>;
      confidence?: number;
    };

    const type = body.type?.trim();
    const name = body.name?.trim();
    const externalId = body.external_id?.trim() || undefined;

    if (!type || !name) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'type and name are required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const externalIdColumnAvailable = externalId ? await hasExternalIdColumn(supabase) : false;

    const { data: graph } = await supabase
      .from('knowledge_graphs')
      .select('id')
      .eq('id', graphId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!graph) {
      return NextResponse.json({ error: 'Not Found', message: 'Graph not found' }, { status: 404 });
    }

    const entityPayload = {
      graph_id: graphId,
      type,
      name,
      description: body.description ?? null,
      aliases: body.aliases ?? [],
      properties: withExternalIdProperty(body.properties ?? {}, externalId),
      confidence: body.confidence ?? 0.8,
      ...(externalId && externalIdColumnAvailable ? { external_id: externalId } : {}),
    };

    let result;
    if (externalId) {
      let existingEntity = null;

      if (externalIdColumnAvailable) {
        const existingByColumn = await supabase
          .from('graph_entities')
          .select('*')
          .eq('graph_id', graphId)
          .eq('external_id', externalId)
          .maybeSingle();

        if (existingByColumn.error && !isMissingExternalIdColumnError(existingByColumn.error)) {
          logServerError('[GraphEntities] POST lookup by column error', existingByColumn.error, {
            graphId,
            organizationId: auth.organizationId,
            externalId,
          });
          return NextResponse.json(
            { error: 'Database Error', message: existingByColumn.error.message },
            { status: 500 }
          );
        }

        existingEntity = existingByColumn.data ?? null;
      }

      if (!existingEntity) {
        const existingByProperties = await supabase
          .from('graph_entities')
          .select('*')
          .eq('graph_id', graphId)
          .contains('properties', { external_id: externalId })
          .maybeSingle();

        if (existingByProperties.error) {
          logServerError('[GraphEntities] POST lookup by properties error', existingByProperties.error, {
            graphId,
            organizationId: auth.organizationId,
            externalId,
          });
          return NextResponse.json(
            { error: 'Database Error', message: existingByProperties.error.message },
            { status: 500 }
          );
        }

        existingEntity = existingByProperties.data ?? null;
      }

      result = existingEntity
        ? await supabase
            .from('graph_entities')
            .update(entityPayload)
            .eq('id', existingEntity.id)
            .eq('graph_id', graphId)
            .select('*')
            .single()
        : await supabase.from('graph_entities').insert(entityPayload).select('*').single();
    } else {
      result = await supabase.from('graph_entities').insert(entityPayload).select('*').single();
    }

    if (result.error) {
      logServerError('[GraphEntities] POST insert error', result.error, {
        graphId,
        organizationId: auth.organizationId,
        externalId,
      });
      return NextResponse.json(
        { error: 'Database Error', message: result.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        entity: {
          ...result.data,
          external_id: getEntityExternalId(result.data),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError('[GraphEntities] POST error', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
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
        external_id: getEntityExternalId(e),
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
