import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, NotFoundErrors, ServerErrors, ValidationErrors } from '@/lib/api-error';
import { getTraceStore } from '@/lib/fall/flight-recorder';
import {
  generateReceipt,
  formatReceiptAsText,
  formatReceiptAsJSON,
  QueryReceipt,
} from '@/lib/retrieval/receipt';

/**
 * GET /api/retrieval/traces/[id]/receipt
 *
 * Returns a human-readable receipt for a specific trace.
 * Query params:
 * - format: 'json' | 'text' (default: 'json')
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

    const { id } = await context.params;

    if (!id) {
      return NotFoundErrors.resource('trace');
    }

    const store = getTraceStore();
    const trace = await store.getTrace(id, authResult.userId);

    if (!trace) {
      return NotFoundErrors.resource('trace');
    }

    // Get format from query params
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    if (format !== 'json' && format !== 'text') {
      return ValidationErrors.invalidField('format', 'must be json or text');
    }

    // Generate receipt from stored trace
    const receipt: QueryReceipt = generateReceipt(trace);

    if (format === 'text') {
      const textReceipt = formatReceiptAsText(receipt);
      return new NextResponse(textReceipt, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    return NextResponse.json({
      success: true,
      receipt,
    });
  } catch (error) {
    console.error('Receipt get error:', error);
    return ServerErrors.internal('receipt_get');
  }
}
