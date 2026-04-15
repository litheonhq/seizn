import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  getEntityExternalId,
  isMissingExternalIdColumnError,
} from '@/lib/graph/external-id';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ graphId: string; externalId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { graphId, externalId } = await params;
    const supabase = createServerClient();

    const { data: graph } = await supabase
      .from('knowledge_graphs')
      .select('id')
      .eq('id', graphId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!graph) {
      return NextResponse.json({ error: 'Not Found', message: 'Graph not found' }, { status: 404 });
    }

    let entity = null;

    const byColumn = await supabase
      .from('graph_entities')
      .select('*')
      .eq('graph_id', graphId)
      .eq('external_id', externalId)
      .maybeSingle();

    if (byColumn.error && !isMissingExternalIdColumnError(byColumn.error)) {
      logServerError('[GraphEntitiesByExternalId] GET database error', byColumn.error, {
        graphId,
        organizationId: auth.organizationId,
        externalId,
      });
      return NextResponse.json(
        { error: 'Database Error', message: byColumn.error.message },
        { status: 500 }
      );
    }

    entity = byColumn.data ?? null;

    if (!entity) {
      const byProperties = await supabase
        .from('graph_entities')
        .select('*')
        .eq('graph_id', graphId)
        .contains('properties', { external_id: externalId })
        .maybeSingle();

      if (byProperties.error) {
        logServerError('[GraphEntitiesByExternalId] GET properties lookup error', byProperties.error, {
          graphId,
          organizationId: auth.organizationId,
          externalId,
        });
        return NextResponse.json(
          { error: 'Database Error', message: byProperties.error.message },
          { status: 500 }
        );
      }

      entity = byProperties.data ?? null;
    }

    if (!entity) {
      return NextResponse.json({ error: 'Not Found', message: 'Entity not found' }, { status: 404 });
    }

    return NextResponse.json({
      entity: {
        ...entity,
        external_id: getEntityExternalId(entity),
      },
    });
  } catch (error) {
    logServerError('[GraphEntitiesByExternalId] GET error', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
