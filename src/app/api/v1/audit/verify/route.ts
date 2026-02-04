/**
 * POST /api/v1/audit/verify - Verify audit log integrity
 *
 * Verifies hash chain and/or Merkle batch integrity for tamper-evident audit logs.
 *
 * @security Requires admin or audit:read scope
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyHashChain, verifyMerkleBatch, generateInclusionProof, verifyInclusionProof } from '@/lib/audit';
import { validateApiKey } from '@/lib/auth/api-key';
import { getAuditContext } from '@/lib/audit';
import { logTamperEvidentEvent } from '@/lib/audit/tamper-evident';

interface VerifyChainRequest {
  type: 'chain';
  organization_id: string;
  start_sequence?: number;
  end_sequence?: number;
}

interface VerifyBatchRequest {
  type: 'batch';
  batch_id: string;
}

interface VerifyEntryRequest {
  type: 'entry';
  entry_id: string;
}

interface GenerateProofRequest {
  type: 'proof';
  entry_id: string;
}

type VerifyRequest =
  | VerifyChainRequest
  | VerifyBatchRequest
  | VerifyEntryRequest
  | GenerateProofRequest;

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.error },
        { status: 401 }
      );
    }

    // Check for admin scope or audit:read
    const hasPermission =
      auth.scopes?.includes('admin') ||
      auth.scopes?.includes('audit:read') ||
      auth.scopes?.includes('*');

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires admin or audit:read scope' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as VerifyRequest;

    // Log the verification attempt
    const context = getAuditContext(request);
    await logTamperEvidentEvent({
      organization_id: auth.organizationId,
      user_id: auth.userId,
      action: 'audit.verify',
      resource_type: 'audit',
      resource_id: body.type === 'batch' ? body.batch_id : body.type === 'entry' || body.type === 'proof' ? body.entry_id : undefined,
      details: {
        verification_type: body.type,
        ...(body.type === 'chain' && {
          start_sequence: body.start_sequence,
          end_sequence: body.end_sequence,
        }),
      },
      status: 'success',
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      request_id: context.requestId,
    });

    switch (body.type) {
      case 'chain': {
        if (!body.organization_id) {
          return NextResponse.json(
            { error: 'Bad Request', message: 'organization_id is required for chain verification' },
            { status: 400 }
          );
        }

        // Ensure user can only verify their own organization
        if (body.organization_id !== auth.organizationId && !auth.scopes?.includes('admin')) {
          return NextResponse.json(
            { error: 'Forbidden', message: 'Cannot verify other organizations' },
            { status: 403 }
          );
        }

        const result = await verifyHashChain(body.organization_id, {
          startSequence: body.start_sequence,
          endSequence: body.end_sequence,
        });

        return NextResponse.json({
          type: 'chain_verification',
          result,
        });
      }

      case 'batch': {
        if (!body.batch_id) {
          return NextResponse.json(
            { error: 'Bad Request', message: 'batch_id is required for batch verification' },
            { status: 400 }
          );
        }

        const result = await verifyMerkleBatch(body.batch_id);

        return NextResponse.json({
          type: 'batch_verification',
          batch_id: body.batch_id,
          result,
        });
      }

      case 'entry': {
        if (!body.entry_id) {
          return NextResponse.json(
            { error: 'Bad Request', message: 'entry_id is required for entry verification' },
            { status: 400 }
          );
        }

        // Generate and verify inclusion proof
        const proof = await generateInclusionProof(body.entry_id);

        if (!proof) {
          return NextResponse.json({
            type: 'entry_verification',
            entry_id: body.entry_id,
            valid: false,
            error: 'Entry not found or not in a Merkle batch',
          });
        }

        const valid = verifyInclusionProof(proof);

        return NextResponse.json({
          type: 'entry_verification',
          entry_id: body.entry_id,
          valid,
          proof: valid ? proof : undefined,
        });
      }

      case 'proof': {
        if (!body.entry_id) {
          return NextResponse.json(
            { error: 'Bad Request', message: 'entry_id is required for proof generation' },
            { status: 400 }
          );
        }

        const proof = await generateInclusionProof(body.entry_id);

        if (!proof) {
          return NextResponse.json(
            {
              error: 'Not Found',
              message: 'Entry not found or not in a Merkle batch',
            },
            { status: 404 }
          );
        }

        return NextResponse.json({
          type: 'inclusion_proof',
          entry_id: body.entry_id,
          proof,
        });
      }

      default:
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: 'Invalid verification type. Use: chain, batch, entry, or proof',
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[AuditVerify] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/audit/verify - Get verification status
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.error },
        { status: 401 }
      );
    }

    return NextResponse.json({
      endpoints: {
        'POST /api/v1/audit/verify': {
          description: 'Verify audit log integrity',
          types: {
            chain: {
              description: 'Verify hash chain for an organization',
              required: ['organization_id'],
              optional: ['start_sequence', 'end_sequence'],
            },
            batch: {
              description: 'Verify a Merkle batch',
              required: ['batch_id'],
            },
            entry: {
              description: 'Verify a specific entry using its inclusion proof',
              required: ['entry_id'],
            },
            proof: {
              description: 'Generate inclusion proof for an entry',
              required: ['entry_id'],
            },
          },
        },
      },
      required_scopes: ['admin', 'audit:read'],
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
