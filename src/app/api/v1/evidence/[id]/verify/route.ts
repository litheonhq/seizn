/**
 * Evidence Pack Verify API
 *
 * GET /api/v1/evidence/:id/verify - Verify evidence pack integrity
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  createEvidencePackStore,
  createEvidencePackVerifier,
} from '@/lib/provenance/evidence-pack';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const store = createEvidencePackStore();
    const pack = await store.retrieve(id);

    if (!pack) {
      return NextResponse.json({ error: 'Not Found', message: 'Evidence pack not found' }, { status: 404 });
    }

    if (pack.metadata.organizationId !== auth.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const verifier = createEvidencePackVerifier();
    const result = verifier.verifyIntegrity(pack);

    return NextResponse.json({
      verification: {
        pack_id: pack.id,
        valid: result.valid,
        hash_verified: result.errors.every((e) => !e.includes('Hash')),
        signature_verified: pack.signature
          ? result.errors.every((e) => !e.includes('Signature'))
          : null,
        structure_valid: result.errors.every(
          (e) => !e.includes('references non-existent')
        ),
        errors: result.errors.length > 0 ? result.errors : undefined,
        verified_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    logServerError('[EvidenceVerify] GET error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
