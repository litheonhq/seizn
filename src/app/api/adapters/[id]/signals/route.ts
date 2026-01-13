import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  getAdapterForUser,
  SignalCollector,
  recordSignalsBatch,
} from '@/lib/domain-adapter';
import type { SignalType, SignalFilter } from '@/lib/domain-adapter';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// GET /api/adapters/[id]/signals - List signals
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
    const { searchParams } = new URL(request.url);

    // Check adapter exists
    const adapter = await getAdapterForUser(id, userId);
    if (!adapter) {
      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/signals`, method: 'GET', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    // Parse query params
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('page_size') ?? '50', 10), 100);
    const includeStats = searchParams.get('include_stats') === 'true';

    // Build filter
    const filter: SignalFilter = {};
    const signalType = searchParams.get('signal_type');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (signalType) filter.signalType = signalType as SignalType;
    if (startDate) filter.startDate = new Date(startDate);
    if (endDate) filter.endDate = new Date(endDate);

    // Fetch signals
    const collector = new SignalCollector();
    const { signals, total } = await collector.getSignals(id, filter, page, pageSize);

    // Optionally include stats
    let stats;
    if (includeStats) {
      stats = await collector.getSignalStats(id);
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}/signals`, method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      signals: signals.map(formatSignalResponse),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
      ...(stats && {
        stats: {
          total: stats.total,
          by_type: stats.byType,
          with_embeddings: stats.withEmbeddings,
          avg_dwell_time: stats.avgDwellTime,
          recent_count: stats.recentCount,
        },
      }),
    });
  } catch (err) {
    console.error('List signals error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// POST /api/adapters/[id]/signals - Record feedback signal
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
        { userId, keyId, endpoint: `/api/adapters/${id}/signals`, method: 'POST', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    // Validate required fields
    if (!body.signal_type) {
      return NextResponse.json(
        { error: 'signal_type is required (explicit_feedback, click, dwell, conversion)' },
        { status: 400 }
      );
    }

    if (!body.query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const collector = new SignalCollector();
    let signal;

    switch (body.signal_type) {
      case 'explicit_feedback':
        if (!body.relevant_doc_ids && !body.irrelevant_doc_ids) {
          return NextResponse.json(
            { error: 'explicit_feedback requires relevant_doc_ids or irrelevant_doc_ids' },
            { status: 400 }
          );
        }
        signal = await collector.recordExplicitFeedback(
          id,
          body.query,
          body.relevant_doc_ids ?? [],
          body.irrelevant_doc_ids ?? [],
          body.query_embedding,
          body.metadata
        );
        break;

      case 'click':
        if (!body.clicked_doc_id) {
          return NextResponse.json(
            { error: 'click signal requires clicked_doc_id' },
            { status: 400 }
          );
        }
        signal = await collector.recordClick(
          id,
          body.query,
          body.clicked_doc_id,
          body.position ?? 0,
          body.query_embedding,
          body.metadata
        );
        break;

      case 'dwell':
        if (!body.doc_id || typeof body.dwell_time_seconds !== 'number') {
          return NextResponse.json(
            { error: 'dwell signal requires doc_id and dwell_time_seconds' },
            { status: 400 }
          );
        }
        signal = await collector.recordDwell(
          id,
          body.query,
          body.doc_id,
          body.dwell_time_seconds,
          body.query_embedding,
          body.metadata
        );
        break;

      case 'conversion':
        if (!body.converted_doc_id) {
          return NextResponse.json(
            { error: 'conversion signal requires converted_doc_id' },
            { status: 400 }
          );
        }
        signal = await collector.recordConversion(
          id,
          body.query,
          body.converted_doc_id,
          body.conversion_type ?? 'default',
          body.query_embedding,
          body.metadata
        );
        break;

      default:
        return NextResponse.json(
          { error: `Invalid signal_type: ${body.signal_type}` },
          { status: 400 }
        );
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}/signals`, method: 'POST', startTime },
      201
    );

    return NextResponse.json(
      { signal: formatSignalResponse(signal) },
      { status: 201 }
    );
  } catch (err) {
    console.error('Record signal error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// PUT /api/adapters/[id]/signals - Batch record signals
// =============================================================================

export async function PUT(request: NextRequest, { params }: RouteParams) {
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
        { userId, keyId, endpoint: `/api/adapters/${id}/signals`, method: 'PUT', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    // Validate signals array
    if (!Array.isArray(body.signals) || body.signals.length === 0) {
      return NextResponse.json(
        { error: 'signals array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (body.signals.length > 1000) {
      return NextResponse.json(
        { error: 'Maximum 1000 signals per batch' },
        { status: 400 }
      );
    }

    // Transform signals for batch insert
    const formattedSignals = body.signals.map(
      (s: {
        query: string;
        query_embedding?: number[];
        signal_type: SignalType;
        relevant_doc_ids?: string[];
        irrelevant_doc_ids?: string[];
        clicked_doc_ids?: string[];
        dwell_times?: Record<string, number>;
        metadata?: Record<string, unknown>;
      }) => ({
        queryText: s.query,
        queryEmbedding: s.query_embedding,
        signalType: s.signal_type,
        positiveDocIds: s.relevant_doc_ids,
        negativeDocIds: s.irrelevant_doc_ids,
        clickedDocIds: s.clicked_doc_ids,
        dwellTimes: s.dwell_times,
        metadata: s.metadata,
      })
    );

    const result = await recordSignalsBatch({
      adapterId: id,
      signals: formattedSignals,
    });

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}/signals`, method: 'PUT', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      errors: result.errors,
      total: body.signals.length,
    });
  } catch (err) {
    console.error('Batch record signals error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// DELETE /api/adapters/[id]/signals - Clear signals
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Check adapter exists
    const adapter = await getAdapterForUser(id, userId);
    if (!adapter) {
      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/signals`, method: 'DELETE', startTime },
        404
      );
      return NextResponse.json({ error: 'Adapter not found' }, { status: 404 });
    }

    const collector = new SignalCollector();

    // Check for specific signal IDs
    const signalIds = searchParams.get('signal_ids');
    if (signalIds) {
      const ids = signalIds.split(',');
      const deleted = await collector.deleteSignals(ids);

      await logRequest(
        { userId, keyId, endpoint: `/api/adapters/${id}/signals`, method: 'DELETE', startTime },
        200
      );

      return NextResponse.json({ success: true, deleted_count: deleted });
    }

    // Clear all signals (requires confirmation)
    const confirm = searchParams.get('confirm');
    if (confirm !== 'true') {
      return NextResponse.json(
        { error: 'Add confirm=true to delete all signals' },
        { status: 400 }
      );
    }

    const deleted = await collector.clearSignals(id);

    await logRequest(
      { userId, keyId, endpoint: `/api/adapters/${id}/signals`, method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({ success: true, deleted_count: deleted });
  } catch (err) {
    console.error('Delete signals error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatSignalResponse(signal: any) {
  return {
    id: signal.id,
    adapter_id: signal.adapterId,
    query_text: signal.queryText,
    has_embedding: !!signal.queryEmbedding,
    positive_doc_ids: signal.positiveDocIds,
    negative_doc_ids: signal.negativeDocIds,
    clicked_doc_ids: signal.clickedDocIds,
    dwell_times: signal.dwellTimes,
    signal_type: signal.signalType,
    metadata: signal.metadata,
    created_at: signal.createdAt.toISOString(),
  };
}
