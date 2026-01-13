/**
 * POST /api/compression/compress
 *
 * Compresses context chunks for reduced cost/latency while maintaining
 * reversible pointer maps for evidence tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import { compressContext, type ChunkInput, type CompressionOptions } from '@/lib/compression';

interface CompressRequestBody {
  chunks: ChunkInput[];
  query: string;
  target_ratio?: number;
  options?: CompressionOptions;
}

export async function POST(request: NextRequest) {
  // Authenticate request
  const authResult = await authenticateRequest(request);

  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  try {
    const body = (await request.json()) as CompressRequestBody;

    // Validate required fields
    if (!body.chunks || !Array.isArray(body.chunks) || body.chunks.length === 0) {
      return NextResponse.json(
        {
          error: {
            error_code: 'INVALID_REQUEST',
            message: 'chunks array is required and must not be empty',
          },
        },
        { status: 400 }
      );
    }

    if (!body.query || typeof body.query !== 'string') {
      return NextResponse.json(
        {
          error: {
            error_code: 'INVALID_REQUEST',
            message: 'query string is required for compression',
          },
        },
        { status: 400 }
      );
    }

    // Validate chunks structure
    for (const chunk of body.chunks) {
      if (!chunk.chunk_id || !chunk.text) {
        return NextResponse.json(
          {
            error: {
              error_code: 'INVALID_REQUEST',
              message: 'Each chunk must have chunk_id and text fields',
            },
          },
          { status: 400 }
        );
      }
    }

    // Build compression options
    const options: Partial<CompressionOptions> = {
      ...body.options,
    };

    // Apply target_ratio if provided
    if (body.target_ratio !== undefined) {
      if (body.target_ratio < 0.1 || body.target_ratio > 1.0) {
        return NextResponse.json(
          {
            error: {
              error_code: 'INVALID_REQUEST',
              message: 'target_ratio must be between 0.1 and 1.0',
            },
          },
          { status: 400 }
        );
      }
      options.target_ratio = body.target_ratio;
    }

    // Perform compression
    const result = await compressContext(body.chunks, body.query, options);

    return NextResponse.json({
      success: true,
      chunks: result.chunks,
      total_original_tokens: result.total_original_tokens,
      total_compressed_tokens: result.total_compressed_tokens,
      overall_ratio: result.overall_ratio,
      stats: result.stats,
    });
  } catch (error) {
    console.error('Compression error:', error);

    return NextResponse.json(
      {
        error: {
          error_code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Compression failed',
        },
      },
      { status: 500 }
    );
  }
}
