import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  createAdapter,
  listAdapters,
  getAdapterStats,
} from '@/lib/domain-adapter';
import type { CreateAdapterParams, AdapterFilter } from '@/lib/domain-adapter';
import { logServerError } from '@/lib/server/logger';

// =============================================================================
// GET /api/adapters - List domain adapters
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('page_size') ?? '20', 10), 100);
    const includeStats = searchParams.get('include_stats') === 'true';

    // Build filter
    const filter: AdapterFilter = {};
    const status = searchParams.get('status');
    const domainType = searchParams.get('domain_type');
    const collectionId = searchParams.get('collection_id');

    if (status) filter.status = status as AdapterFilter['status'];
    if (domainType) filter.domainType = domainType;
    if (collectionId) filter.collectionId = collectionId;

    // Fetch adapters
    const { adapters, total } = await listAdapters(userId, filter, page, pageSize);

    // Optionally include stats
    let stats;
    if (includeStats) {
      stats = await getAdapterStats(userId);
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/adapters', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      adapters: adapters.map(formatAdapterResponse),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
      ...(stats && { stats }),
    });
  } catch (err) {
    logServerError('List adapters request failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// POST /api/adapters - Create a new domain adapter
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/adapters', method: 'POST', startTime },
        400
      );
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Build params
    const params: CreateAdapterParams = {
      name: body.name,
      description: body.description,
      collectionId: body.collection_id,
      domainType: body.domain_type,
      adapterRank: body.adapter_rank,
      scale: body.scale,
      autoRetrain: body.auto_retrain,
      retrainThreshold: body.retrain_threshold,
    };

    // Validate adapter rank
    if (params.adapterRank !== undefined) {
      if (params.adapterRank < 1 || params.adapterRank > 64) {
        return NextResponse.json(
          { error: 'adapter_rank must be between 1 and 64' },
          { status: 400 }
        );
      }
    }

    // Validate scale
    if (params.scale !== undefined) {
      if (params.scale < 0 || params.scale > 10) {
        return NextResponse.json(
          { error: 'scale must be between 0 and 10' },
          { status: 400 }
        );
      }
    }

    // Create adapter
    const adapter = await createAdapter(userId, params);

    await logRequest(
      { userId, keyId, endpoint: '/api/adapters', method: 'POST', startTime },
      201
    );

    return NextResponse.json(
      { adapter: formatAdapterResponse(adapter) },
      { status: 201 }
    );
  } catch (err) {
    logServerError('Create adapter request failed', err);
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
  };
}
