/**
 * RAG Retrieve API
 *
 * Search and retrieve relevant chunks from collections.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { createRAGService } from '@/lib/rag/service';
import { logServerError } from '@/lib/server/logger';

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

    const body = await request.json();

    if (!body.query) {
      return NextResponse.json(
        { error: 'query is required' },
        { status: 400 }
      );
    }

    // Validate collection access if specific collections are requested
    if (body.collectionIds && body.collectionIds.length > 0) {
      const ragService = createRAGService(supabase);

      for (const collectionId of body.collectionIds) {
        const collection = await ragService.getCollection(collectionId);
        if (!collection) {
          return NextResponse.json(
            { error: `Collection not found: ${collectionId}` },
            { status: 404 }
          );
        }
        if (collection.organizationId !== membership.organization_id) {
          return NextResponse.json(
            { error: `Access denied to collection: ${collectionId}` },
            { status: 403 }
          );
        }
      }
    }

    const ragService = createRAGService(supabase);
    const result = await ragService.retrieve(membership.organization_id, {
      query: body.query,
      collectionIds: body.collectionIds,
      topK: body.topK,
      minScore: body.minScore,
      filter: body.filter,
      reranker: body.reranker,
      hybridSearch: body.hybridSearch,
      includeMetadata: body.includeMetadata,
      includeContent: body.includeContent,
    });

    return NextResponse.json({ result });
  } catch (error) {
    logServerError('RAG retrieve error', error);

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
