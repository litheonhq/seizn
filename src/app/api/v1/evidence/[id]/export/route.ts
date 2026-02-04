/**
 * Evidence Pack Export API
 *
 * GET /api/v1/evidence/:id/export - Export evidence pack
 *
 * Query params:
 * - format: 'prov-json' (default) | 'prov-n' | 'json'
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  createEvidencePackStore,
  exportToProvJson,
  exportToProvN,
} from '@/lib/provenance/evidence-pack';

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
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'prov-json';

    const store = createEvidencePackStore();
    const pack = await store.retrieve(id);

    if (!pack) {
      return NextResponse.json({ error: 'Not Found', message: 'Evidence pack not found' }, { status: 404 });
    }

    if (pack.metadata.organizationId !== auth.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    switch (format) {
      case 'prov-json': {
        const content = exportToProvJson(pack);
        return new NextResponse(content, {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="evidence-${id}.prov.json"`,
          },
        });
      }

      case 'prov-n': {
        const content = exportToProvN(pack);
        return new NextResponse(content, {
          headers: {
            'Content-Type': 'text/provenance-notation',
            'Content-Disposition': `attachment; filename="evidence-${id}.provn"`,
          },
        });
      }

      case 'json': {
        return NextResponse.json({
          id: pack.id,
          version: pack.version,
          created: pack.created,
          hash: pack.hash,
          signature: pack.signature,
          metadata: pack.metadata,
          provenance: pack.provenance,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Bad Request', message: `Unknown format: ${format}. Use 'prov-json', 'prov-n', or 'json'` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[EvidenceExport] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
