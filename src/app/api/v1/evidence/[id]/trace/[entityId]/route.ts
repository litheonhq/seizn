/**
 * Evidence Pack Trace API
 *
 * GET /api/v1/evidence/:id/trace/:entityId - Trace derivation chain
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  createEvidencePackStore,
  createEvidencePackVerifier,
} from '@/lib/provenance/evidence-pack';

interface RouteParams {
  params: Promise<{ id: string; entityId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { id, entityId } = await params;

    const store = createEvidencePackStore();
    const pack = await store.retrieve(id);

    if (!pack) {
      return NextResponse.json({ error: 'Not Found', message: 'Evidence pack not found' }, { status: 404 });
    }

    if (pack.metadata.organizationId !== auth.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Decode entity ID (may be URL encoded)
    const decodedEntityId = decodeURIComponent(entityId);

    // Check if entity exists
    if (!pack.provenance.entity[decodedEntityId]) {
      return NextResponse.json(
        { error: 'Not Found', message: `Entity not found: ${decodedEntityId}` },
        { status: 404 }
      );
    }

    const verifier = createEvidencePackVerifier();
    const chain = verifier.traceDerivation(pack, decodedEntityId);

    return NextResponse.json({
      trace: {
        pack_id: pack.id,
        entity_id: decodedEntityId,
        chain_length: chain.length,
        derivation_chain: chain.map((item) => ({
          entity: {
            id: item.entity.id,
            label: item.entity.label,
            type: item.entity.type,
            generated_at: item.entity.generatedAtTime,
          },
          derivation_type: item.derivationType,
          via_activity: item.via
            ? {
                id: item.via.id,
                label: item.via.label,
                started_at: item.via.startedAtTime,
                ended_at: item.via.endedAtTime,
              }
            : undefined,
        })),
      },
    });
  } catch (error) {
    console.error('[EvidenceTrace] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
