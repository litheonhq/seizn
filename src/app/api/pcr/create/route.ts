/**
 * POST /api/pcr/create
 *
 * Create a proof chain record from RAG pipeline data.
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
  createProofChainFromRequest,
  signProofChain,
  type CreateProofChainRequest,
  type CreateProofChainResponse,
  type SignProofChainResponse,
} from '@/lib/pcr';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    let body: CreateProofChainRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    if (!body.query || typeof body.query !== 'string') {
      return ValidationErrors.missingField('query');
    }

    // Create proof chain
    const proofChain = createProofChainFromRequest(body, userId);

    // Auto-sign the proof chain
    const signature = signProofChain(proofChain, {
      signerId: userId,
      keyId: keyId || 'default',
    });

    // Update proof chain status
    proofChain.status = 'signed';

    // Build response
    const response: CreateProofChainResponse & { signature: SignProofChainResponse['signature'] } = {
      proofChain,
      signature,
      message: 'Proof chain created and signed successfully',
    };

    // Log the request
    await logRequest(
      { userId, keyId, endpoint: '/api/pcr/create', method: 'POST', startTime },
      200
    );

    return NextResponse.json(response, {
      status: 200,
      headers: rateLimitHeaders,
    });
  } catch (error) {
    console.error('PCR create error:', error);
    return ServerErrors.internal('Failed to create proof chain');
  }
}
