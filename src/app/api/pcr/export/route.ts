/**
 * POST /api/pcr/export
 *
 * Export a proof chain as an evidence pack (JSON or ZIP).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  exportEvidencePack,
  type ProofChainRecord,
  type ProofSignature,
  type ExportOptions,
  type ExportEvidencePackResponse,
} from '@/lib/pcr';

export const runtime = 'nodejs';

interface ExportRequestBody {
  proofChain: ProofChainRecord;
  signature: ProofSignature;
  options?: ExportOptions;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    let body: ExportRequestBody;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    if (!body.proofChain || !body.proofChain.id) {
      return ValidationErrors.missingField('proofChain');
    }
    if (!body.signature || !body.signature.id) {
      return ValidationErrors.missingField('signature');
    }

    // Verify ownership
    if (body.proofChain.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized: proof chain does not belong to user' },
        { status: 403 }
      );
    }

    // Export evidence pack
    const exportOptions: ExportOptions = {
      format: body.options?.format || 'json',
      includeRawContent: body.options?.includeRawContent ?? true,
      includeSummary: body.options?.includeSummary ?? true,
      filenamePrefix: body.options?.filenamePrefix,
    };

    const result = await exportEvidencePack(
      body.proofChain,
      body.signature,
      exportOptions
    );

    // Build response
    const response: ExportEvidencePackResponse & {
      filename: string;
      contentType: string;
    } = {
      pack: result.pack,
      content: result.content,
      filename: result.filename,
      contentType: result.contentType,
    };

    // Log the request
    await logRequest(
      { userId, keyId, endpoint: '/api/pcr/export', method: 'POST', startTime },
      200
    );

    return NextResponse.json(response, {
      status: 200,
      headers: rateLimitHeaders,
    });
  } catch (error) {
    console.error('PCR export error:', error);
    return ServerErrors.internal('Failed to export evidence pack');
  }
}
