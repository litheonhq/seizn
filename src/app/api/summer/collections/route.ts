import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { logServerError } from '@/lib/server/logger';

// GET /api/summer/collections - list
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('summer_collections')
      .select('id, name, description, embedding_provider, embedding_model, embedding_dimensions, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/collections', method: 'GET', startTime },
        500
      );
      return NextResponse.json({ error: 'Failed to list collections' }, { status: 500 });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/summer/collections', method: 'GET', startTime },
      200
    );

    return NextResponse.json({ success: true, collections: data ?? [] });
  } catch (err) {
    logServerError('Summer collections GET error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/summer/collections - create
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    const name = (body?.name ?? '').trim();
    const description = (body?.description ?? '').trim();

    if (!name) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/collections', method: 'POST', startTime },
        400
      );
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('summer_collections')
      .insert({
        user_id: userId,
        name,
        description: description || null,
        embedding_provider: body?.embedding_provider ?? 'voyage',
        embedding_model: body?.embedding_model ?? 'voyage-3',
        embedding_dimensions: body?.embedding_dimensions ?? 1024,
      })
      .select('id, name, description, created_at, updated_at')
      .single();

    if (error) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/collections', method: 'POST', startTime },
        500
      );
      return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/summer/collections', method: 'POST', startTime },
      200
    );

    return NextResponse.json({ success: true, collection: data });
  } catch (err) {
    logServerError('Summer collections POST error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/summer/collections?collection_id=... - delete
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const searchParams = request.nextUrl.searchParams;
    let collectionId = searchParams.get('collection_id') ?? searchParams.get('id') ?? '';

    if (!collectionId) {
      try {
        const body = await request.json();
        collectionId = String(body?.collection_id ?? body?.id ?? '');
      } catch {
        // Ignore parse error and validate empty id below
      }
    }

    collectionId = collectionId.trim();
    if (!collectionId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/collections', method: 'DELETE', startTime },
        400
      );
      return NextResponse.json({ error: 'collection_id is required' }, { status: 400 });
    }

    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidLike.test(collectionId)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/collections', method: 'DELETE', startTime },
        400
      );
      return NextResponse.json({ error: 'collection_id must be a valid UUID' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('summer_collections')
      .delete()
      .eq('id', collectionId)
      .eq('user_id', userId)
      .select('id, name')
      .maybeSingle();

    if (error) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/collections', method: 'DELETE', startTime },
        500
      );
      return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 });
    }

    if (!data) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/collections', method: 'DELETE', startTime },
        404
      );
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/summer/collections', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({ success: true, deleted: data });
  } catch (err) {
    logServerError('Summer collections DELETE error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
