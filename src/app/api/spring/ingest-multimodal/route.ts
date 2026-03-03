/**
 * Multimodal Ingestion API
 *
 * POST /api/spring/ingest-multimodal - Process image and extract memories
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createMultimodalService } from '@/lib/spring/memory-v4/multimodal-service';

const IMAGE_CLIENT_ERROR_PATTERNS = [
  'imageurl must',
  'imageurl hostname',
  'imageurl resolves to a private or internal ip',
  'imageurl redirect',
  'too many redirects while fetching imageurl',
  'timed out while fetching imageurl',
  'imageurl must point to an image resource',
  'unsupported image mime type',
  'image too large',
  'decoded image is empty',
] as const;

function getImageClientErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error) || !error.message) return null;
  const lowered = error.message.toLowerCase();
  const matched = IMAGE_CLIENT_ERROR_PATTERNS.some((token) => lowered.includes(token));
  return matched ? error.message : null;
}

// =============================================================================
// POST - Multimodal Ingestion
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate input
    if (!body.imageUrl && !body.imageBase64) {
      return ValidationErrors.missingField('imageUrl or imageBase64');
    }

    // Validate mime type if base64
    if (body.imageBase64 && !body.mimeType) {
      return ValidationErrors.missingField('mimeType (required when using imageBase64)');
    }

    const supabase = createServerClient();
    const service = createMultimodalService(supabase);

    const result = await service.processImage(userId, {
      imageUrl: body.imageUrl as string | undefined,
      imageBase64: body.imageBase64 as string | undefined,
      mimeType: body.mimeType as string | undefined,
      filename: body.filename as string | undefined,
      extractionPrompt: body.extractionPrompt as string | undefined,
      noteType: body.noteType as string | undefined,
      category: body.category as string | undefined,
      tags: body.tags as string[] | undefined,
      metadata: body.metadata as Record<string, unknown> | undefined,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/ingest-multimodal', method: 'POST', startTime },
      200,
      { embedding: result.extractedText.length }
    );

    const response = NextResponse.json({
      success: true,
      assetId: result.assetId,
      noteIds: result.noteIds,
      extractedText: result.extractedText,
      extractedFacts: result.extractedFacts.map((f) => ({
        content: f.content,
        type: f.type,
        confidence: f.confidence,
      })),
      processingMs: result.processingMs,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Multimodal ingestion error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('imageUrl or imageBase64')) {
      return ValidationErrors.missingField('imageUrl or imageBase64');
    }
    const clientMessage = getImageClientErrorMessage(error);
    if (clientMessage) {
      return ValidationErrors.invalidField('image', clientMessage);
    }

    return ServerErrors.internal('multimodal_ingestion');
  }
}
