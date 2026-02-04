/**
 * Evidence Pack Detail API
 *
 * GET /api/v1/evidence/:id - Get evidence pack details
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { createEvidencePackStore } from '@/lib/provenance/evidence-pack';

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

    // Verify ownership
    if (pack.metadata.organizationId !== auth.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      evidence_pack: {
        id: pack.id,
        version: pack.version,
        created: pack.created,
        hash: pack.hash,
        has_signature: !!pack.signature,
        metadata: pack.metadata,
        provenance: pack.provenance,
      },
    });
  } catch (error) {
    console.error('[Evidence] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
