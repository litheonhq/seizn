import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';

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
    console.error('Summer collections GET error:', err);
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
    console.error('Summer collections POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
