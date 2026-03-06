/**
 * RAG Collection API
 *
 * Get, update, and delete a specific collection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { createRAGService } from '@/lib/rag/service';
import { logServerError } from '@/lib/server/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const ragService = createRAGService(supabase);
    const collection = await ragService.getCollection(collectionId);

    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    // Verify user has access to this collection's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', collection.organizationId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({ collection });
  } catch (error) {
    logServerError('RAG collection get error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const ragService = createRAGService(supabase);
    const existingCollection = await ragService.getCollection(collectionId);

    if (!existingCollection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    // Verify user has access and permission
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('organization_id', existingCollection.organizationId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    if (!['owner', 'admin', 'member'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const collection = await ragService.updateCollection(collectionId, {
      name: body.name,
      description: body.description,
      chunkingStrategy: body.chunkingStrategy,
      metadata: body.metadata,
    });

    return NextResponse.json({ collection });
  } catch (error) {
    logServerError('RAG collection update error', error);

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const ragService = createRAGService(supabase);
    const existingCollection = await ragService.getCollection(collectionId);

    if (!existingCollection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    // Verify user has access and admin permission
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('organization_id', existingCollection.organizationId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    await ragService.deleteCollection(collectionId);

    return NextResponse.json({ message: 'Collection deleted' });
  } catch (error) {
    logServerError('RAG collection delete error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
