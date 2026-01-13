import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  getAdapterForUser,
  updateAdapter,
  deleteAdapter,
} from '@/lib/domain-adapter';
import type { UpdateAdapterParams } from '@/lib/domain-adapter';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// GET /api/adapters/[id] - Get adapter by ID
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

    const adapter = await getAdapterForUser(id, userId);

    if (!adapter) {
      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}`, method: 'GET', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}`, method: 'GET', startTime },
      200
    );

    return NextResponse.json({ adapter: formatAdapterResponse(adapter) });
  } catch (err) {
    console.error('Get adapter error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/adapters/[id] - Update adapter
// =============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    // Check adapter exists
    const existing = await getAdapterForUser(id, userId);
    if (!existing) {
      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}`, method: 'PATCH', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    // Build update params
    const updateParams: UpdateAdapterParams = {};

    if (body.name !== undefined) updateParams.name = body.name;
    if (body.description !== undefined) updateParams.description = body.description;
    if (body.domain_type !== undefined) updateParams.domainType = body.domain_type;
    if (body.scale !== undefined) {
      if (body.scale < 0 || body.scale > 10) {
        return NextResponse.json(
          { error: 'scale must be between 0 and 10' },
          { status: 400 }
        );
      }
      updateParams.scale = body.scale;
    }
    if (body.auto_retrain !== undefined) updateParams.autoRetrain = body.auto_retrain;
    if (body.retrain_threshold !== undefined)
      updateParams.retrainThreshold = body.retrain_threshold;

    const adapter = await updateAdapter(id, userId, updateParams);

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}`, method: 'PATCH', startTime },
      200
    );

    return NextResponse.json({ adapter: formatAdapterResponse(adapter) });
  } catch (err) {
    console.error('Update adapter error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// DELETE /api/adapters/[id] - Delete adapter
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Check adapter exists
    const existing = await getAdapterForUser(id, userId);
    if (!existing) {
      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}`, method: 'DELETE', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    await deleteAdapter(id, userId);

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}`, method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({ success: true, deleted_id: id });
  } catch (err) {
    console.error('Delete adapter error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatAdapterResponse(adapter: any) {
  return {
    id: adapter.id,
    name: adapter.name,
    description: adapter.description,
    collection_id: adapter.collectionId,
    domain_type: adapter.domainType,
    adapter_rank: adapter.adapterRank,
    scale: adapter.scale,
    status: adapter.status,
    training_samples: adapter.trainingSamples,
    positive_samples: adapter.positiveSamples,
    negative_samples: adapter.negativeSamples,
    validation_mrr: adapter.validationMrr,
    auto_retrain: adapter.autoRetrain,
    retrain_threshold: adapter.retrainThreshold,
    last_trained_at: adapter.lastTrainedAt?.toISOString(),
    created_at: adapter.createdAt.toISOString(),
    updated_at: adapter.updatedAt.toISOString(),
    // Include weights info (not actual weights for response size)
    has_weights: !!(adapter.weightsA && adapter.weightsB),
  };
}
