/**
 * POST /api/compression/expand
 *
 * Expands compressed chunks back to original text using pointer maps.
 * Supports full expansion or selective sentence expansion.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import {
  expandToOriginal,
  expandSentences,
  validateCompressedChunk,
  type CompressedChunk,
} from '@/lib/compression';

interface ExpandRequestBody {
  compressed: CompressedChunk;
  pointer_indices?: number[];
}

export async function POST(request: NextRequest) {
  // Authenticate request
  const authResult = await authenticateRequest(request);

  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  try {
    const body = (await request.json()) as ExpandRequestBody;

    // Validate required fields
    if (!body.compressed) {
      return NextResponse.json(
        {
          error: {
            error_code: 'INVALID_REQUEST',
            message: 'compressed chunk object is required',
          },
        },
        { status: 400 }
      );
    }

    // Validate compressed chunk structure
    const validation = validateCompressedChunk(body.compressed);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: {
            error_code: 'INVALID_REQUEST',
            message: `Invalid compressed chunk: ${validation.issues.join(', ')}`,
          },
        },
        { status: 400 }
      );
    }

    // Perform expansion
    let result;

    if (body.pointer_indices && body.pointer_indices.length > 0) {
      // Selective expansion
      result = expandSentences(body.compressed, body.pointer_indices);
    } else {
      // Full expansion
      result = expandToOriginal(body.compressed);
    }

    return NextResponse.json({
      success: true,
      expanded_text: result.expanded_text,
      expanded_indices: result.expanded_indices,
      is_full_expansion: result.is_full_expansion,
    });
  } catch (error) {
    console.error('Expansion error:', error);

    return NextResponse.json(
      {
        error: {
          error_code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Expansion failed',
        },
      },
      { status: 500 }
    );
  }
}
