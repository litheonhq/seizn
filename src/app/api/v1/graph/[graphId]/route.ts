/**
 * Knowledge Graph Instance API
 *
 * DELETE /api/v1/graph/:graphId - Delete a knowledge graph
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiScope } from '@/lib/auth/api-scope';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ graphId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiScope(request, 'graph:delete');
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

    // Delete in order: relationships -> entities -> graph
    const { error: relError } = await supabase
      .from('graph_relationships')
      .delete()
      .eq('graph_id', graphId);

    if (relError) {
      return NextResponse.json(
        { error: 'Database Error', message: relError.message },
        { status: 500 }
      );
    }

    const { error: entError } = await supabase
      .from('graph_entities')
      .delete()
      .eq('graph_id', graphId);

    if (entError) {
      return NextResponse.json(
        { error: 'Database Error', message: entError.message },
        { status: 500 }
      );
    }

    const { error: graphError } = await supabase
      .from('knowledge_graphs')
      .delete()
      .eq('id', graphId);

    if (graphError) {
      return NextResponse.json(
        { error: 'Database Error', message: graphError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ deleted: true, graph_id: graphId });
  } catch (error) {
    logServerError('[Graph] DELETE error', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
