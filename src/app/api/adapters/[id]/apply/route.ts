import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  getAdapterForUser,
  applyAdapterToEmbedding,
  applyAdapterToEmbeddings,
} from '@/lib/domain-adapter';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// POST /api/adapters/[id]/apply - Apply adapter to embeddings
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    // Check adapter exists
    const adapter = await getAdapterForUser(id, userId);
    if (!adapter) {
      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/apply`, method: 'POST', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    // Check adapter is ready
    if (adapter.status !== 'ready') {
      return NextResponse.json(
        {
          error: `Adapter is not ready. Current status: ${adapter.status}`,
          hint: adapter.status === 'untrained' ? 'Train the adapter first' : undefined,
        },
        { status: 400 }
      );
    }

    // Check adapter has weights
    if (!adapter.weightsA || !adapter.weightsB) {
      return NextResponse.json(
        { error: 'Adapter has no trained weights' },
        { status: 400 }
      );
    }

    // Handle single embedding
    if (body.embedding && Array.isArray(body.embedding)) {
      if (!isValidEmbedding(body.embedding)) {
        return NextResponse.json(
          { error: 'embedding must be an array of numbers with length 1536' },
          { status: 400 }
        );
      }

      const adapted = applyAdapterToEmbedding(body.embedding, adapter);

      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/apply`, method: 'POST', startTime },
        200
      );

      return NextResponse.json({
        adapter_id: id,
        scale: adapter.scale,
        original_embedding: body.include_original ? body.embedding : undefined,
        adapted_embedding: adapted,
      });
    }

    // Handle batch embeddings
    if (body.embeddings && Array.isArray(body.embeddings)) {
      if (body.embeddings.length === 0) {
        return NextResponse.json(
          { error: 'embeddings array must not be empty' },
          { status: 400 }
        );
      }

      if (body.embeddings.length > 100) {
        return NextResponse.json(
          { error: 'Maximum 100 embeddings per batch' },
          { status: 400 }
        );
      }

      // Validate all embeddings
      for (let i = 0; i < body.embeddings.length; i++) {
        if (!isValidEmbedding(body.embeddings[i])) {
          return NextResponse.json(
            { error: `Invalid embedding at index ${i}` },
            { status: 400 }
          );
        }
      }

      const adapted = applyAdapterToEmbeddings(body.embeddings, adapter);

      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/apply`, method: 'POST', startTime },
        200
      );

      return NextResponse.json({
        adapter_id: id,
        scale: adapter.scale,
        count: adapted.length,
        original_embeddings: body.include_original ? body.embeddings : undefined,
        adapted_embeddings: adapted,
      });
    }

    return NextResponse.json(
      { error: 'Request must include embedding (single) or embeddings (batch)' },
      { status: 400 }
    );
  } catch (err) {
    logServerError('Apply adapter request failed', err, { adapterId: id });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// GET /api/adapters/[id]/apply - Get adapter application info
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Check adapter exists
    const adapter = await getAdapterForUser(id, userId);
    if (!adapter) {
      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/apply`, method: 'GET', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}/apply`, method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      adapter_id: id,
      name: adapter.name,
      status: adapter.status,
      can_apply: adapter.status === 'ready' && !!adapter.weightsA,
      scale: adapter.scale,
      adapter_rank: adapter.adapterRank,
      validation_mrr: adapter.validationMrr,
      last_trained_at: adapter.lastTrainedAt?.toISOString(),
      usage: {
        // Example usage for API docs
        single: {
          method: 'POST',
          body: {
            embedding: '[...1536 dimensional vector...]',
            include_original: false,
          },
        },
        batch: {
          method: 'POST',
          body: {
            embeddings: ['[...vector 1...]', '[...vector 2...]'],
            include_original: false,
          },
        },
      },
    });
  } catch (err) {
    logServerError('Get adapter apply info failed', err, { adapterId: id });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function isValidEmbedding(embedding: unknown): embedding is number[] {
  if (!Array.isArray(embedding)) return false;
  if (embedding.length !== 1536) return false;
  return embedding.every((v) => typeof v === 'number' && !isNaN(v));
}
