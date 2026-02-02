/**
 * RAG Documents API
 *
 * List and add documents to a collection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createRAGService } from '@/lib/rag/service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ragService = createRAGService(supabase);
    const collection = await ragService.getCollection(collectionId);

    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    // Verify user has access
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

    const searchParams = request.nextUrl.searchParams;
    const result = await ragService.listDocuments(collectionId, {
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '20'),
      status: searchParams.get('status') as 'pending' | 'processing' | 'indexed' | 'failed' | undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('RAG documents list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ragService = createRAGService(supabase);
    const collection = await ragService.getCollection(collectionId);

    if (!collection) {
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
      .eq('organization_id', collection.organizationId)
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

    // Validate required fields
    if (!body.sourceType) {
      return NextResponse.json(
        { error: 'sourceType is required' },
        { status: 400 }
      );
    }

    if (!body.content && !body.file && !body.url) {
      return NextResponse.json(
        { error: 'One of content, file, or url is required' },
        { status: 400 }
      );
    }

    const document = await ragService.addDocument(collectionId, {
      content: body.content,
      file: body.file,
      url: body.url,
      sourceType: body.sourceType,
      metadata: body.metadata,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('RAG document add error:', error);

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
