import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ValidationErrors, NotFoundErrors, ServerErrors } from '@/lib/api-error';
import { analyzeWhyNotFromTrace } from '@/lib/retrieval/why-not';

/**
 * POST /api/retrieval/traces/[id]/why-not
 *
 * Analyze why specific document(s) were NOT returned in a retrieval trace.
 *
 * Request Body:
 * - document_id: string (single document)
 * - document_ids: string[] (multiple documents)
 *
 * Response:
 * - results: WhyNotResult[]
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Validate API key or session
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id: traceId } = await context.params;

    if (!traceId) {
      return NotFoundErrors.resource('trace');
    }

    // Parse request body
    const body = await request.json();
    let documentIds: string[] = [];

    if (body.document_id) {
      documentIds = [body.document_id];
    } else if (body.document_ids && Array.isArray(body.document_ids)) {
      documentIds = body.document_ids;
    }

    if (documentIds.length === 0) {
      return ValidationErrors.missingField('document_id or document_ids');
    }

    // Validate document IDs
    for (const id of documentIds) {
      if (typeof id !== 'string' || id.trim() === '') {
        return ValidationErrors.invalidField('document_id', id);
      }
    }

    // Limit number of documents to analyze
    if (documentIds.length > 20) {
      return ValidationErrors.invalidField(
        'document_ids',
        `Too many documents (${documentIds.length}). Maximum is 20.`
      );
    }

    // Perform analysis
    const results = await analyzeWhyNotFromTrace({
      traceId,
      userId: authResult.userId,
      documentIds,
    });

    return NextResponse.json({
      success: true,
      trace_id: traceId,
      results,
      analyzed_count: results.length,
      found_count: results.filter((r) => r.found).length,
      blocked_count: results.filter((r) => !r.found).length,
    });
  } catch (error) {
    console.error('Why-not analysis error:', error);

    if (error instanceof Error && error.message.includes('Trace not found')) {
      return NotFoundErrors.resource('trace');
    }

    return ServerErrors.internal('why_not_analysis');
  }
}

/**
 * GET /api/retrieval/traces/[id]/why-not
 *
 * Get why-not analysis for a trace with query parameters.
 *
 * Query Parameters:
 * - document_id: string (can be repeated for multiple documents)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Validate API key or session
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id: traceId } = await context.params;

    if (!traceId) {
      return NotFoundErrors.resource('trace');
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const documentIds = searchParams.getAll('document_id');

    if (documentIds.length === 0) {
      return ValidationErrors.missingField('document_id query parameter');
    }

    // Limit number of documents
    if (documentIds.length > 20) {
      return ValidationErrors.invalidField(
        'document_id',
        `Too many documents (${documentIds.length}). Maximum is 20.`
      );
    }

    // Perform analysis
    const results = await analyzeWhyNotFromTrace({
      traceId,
      userId: authResult.userId,
      documentIds,
    });

    return NextResponse.json({
      success: true,
      trace_id: traceId,
      results,
      analyzed_count: results.length,
      found_count: results.filter((r) => r.found).length,
      blocked_count: results.filter((r) => !r.found).length,
    });
  } catch (error) {
    console.error('Why-not analysis error:', error);

    if (error instanceof Error && error.message.includes('Trace not found')) {
      return NotFoundErrors.resource('trace');
    }

    return ServerErrors.internal('why_not_analysis');
  }
}
