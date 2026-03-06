/**
 * RAG Collections API
 *
 * List and create RAG collections.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { createRAGService } from '@/lib/rag/service';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    const ragService = createRAGService(supabase);
    const searchParams = request.nextUrl.searchParams;

    const result = await ragService.listCollections(membership.organization_id, {
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '20'),
      status: searchParams.get('status') as 'active' | 'indexing' | 'error' | 'archived' | undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    logServerError('RAG collections list error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    if (!['owner', 'admin', 'member'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const ragService = createRAGService(supabase);

    const collection = await ragService.createCollection(membership.organization_id, {
      name: body.name,
      description: body.description,
      embeddingModel: body.embeddingModel || 'text-embedding-3-small',
      embeddingDimension: body.embeddingDimension,
      chunkingStrategy: body.chunkingStrategy,
      metadata: body.metadata,
    });

    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    logServerError('RAG collection create error', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
