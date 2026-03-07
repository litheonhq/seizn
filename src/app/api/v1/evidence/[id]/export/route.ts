/**
 * Evidence Pack Export API
 *
 * GET /api/v1/evidence/:id/export - Export evidence pack
 *
 * Query params:
 * - format: 'prov-json' (default) | 'prov-n' | 'json' | 'zip'
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { createServerClient } from '@/lib/supabase';
import {
  createEvidencePackStore,
  exportToProvJson,
  exportToProvN,
  exportToSignedZip,
} from '@/lib/provenance/evidence-pack';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getPolicyDecisionsForEvidence(
  userId: string
): Promise<Record<string, unknown>[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('memory_policy_decisions')
    .select('id, memory_id, decision, reason, policy_rule, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) {
    return [];
  }

  return data;
}

function buildPiiRedactionReport(
  policyDecisions: Record<string, unknown>[]
): Record<string, unknown> {
  const piiEvents = policyDecisions.filter((event) => {
    const reason = String(event.reason || '').toLowerCase();
    const decision = String(event.decision || '').toLowerCase();
    return reason === 'pii_detected' || decision === 'masked';
  });

  const maskedEvents = policyDecisions.filter(
    (event) => String(event.decision || '').toLowerCase() === 'masked'
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      policyDecisions: policyDecisions.length,
      piiRelatedEvents: piiEvents.length,
      maskedEvents: maskedEvents.length,
    },
    recentPiiEvents: piiEvents.slice(0, 20),
  };
}

async function buildTraceDigest(
  userId: string,
  traceId?: string
): Promise<Record<string, unknown>> {
  if (!traceId || !isUuid(traceId)) {
    return {
      traceId: traceId || null,
      found: false,
      reason: 'trace_id missing or not UUID',
    };
  }

  const supabase = createServerClient();

  const byRequestId = await supabase
    .from('fall_retrieval_traces')
    .select('id, request_id, query_hash, autopilot_reason, timings_ms, results_count, error, sampled, created_at')
    .eq('user_id', userId)
    .eq('request_id', traceId)
    .maybeSingle();

  let row = byRequestId.data;
  let error = byRequestId.error;

  if (!row) {
    const byId = await supabase
      .from('fall_retrieval_traces')
      .select('id, request_id, query_hash, autopilot_reason, timings_ms, results_count, error, sampled, created_at')
      .eq('user_id', userId)
      .eq('id', traceId)
      .maybeSingle();
    row = byId.data;
    error = byId.error;
  }

  if (error || !row) {
    return {
      traceId,
      found: false,
      reason: error?.message || 'trace not found',
    };
  }

  const timings = (row.timings_ms || {}) as Record<string, unknown>;

  return {
    traceId,
    found: true,
    traceRowId: row.id,
    requestId: row.request_id,
    createdAt: row.created_at,
    queryHash: row.query_hash,
    autopilotReason: row.autopilot_reason,
    totalLatencyMs: Number(timings.total || 0),
    resultsCount: row.results_count,
    error: row.error,
    sampled: row.sampled,
  };
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

      case 'zip': {
        if (!pack.signature) {
          return NextResponse.json(
            {
              error: 'Precondition Failed',
              message: 'Signed zip export requires a signed evidence pack. Create with sign=true first.',
            },
            { status: 412 }
          );
        }

        const policyDecisions = await getPolicyDecisionsForEvidence(auth.userId);
        const piiRedactionReport = buildPiiRedactionReport(policyDecisions);
        const traceDigest = await buildTraceDigest(auth.userId, pack.metadata.traceId);

        const zip = exportToSignedZip(pack, {
          policyDecisions,
          piiRedactionReport,
          traceDigest,
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        return NextResponse.json({
          pack: {
            id: pack.id,
            version: pack.version,
            hash: pack.hash,
            checksum: zip.checksum,
            files: zip.fileCount,
          },
          content: zip.contentBase64,
          filename: `evidence-${id}-${timestamp}.zip`,
          contentType: 'application/zip',
        });
      }

      default:
        return NextResponse.json(
          { error: 'Bad Request', message: `Unknown format: ${format}. Use 'prov-json', 'prov-n', 'json', or 'zip'` },
          { status: 400 }
        );
    }
  } catch (error) {
    logServerError('[EvidenceExport] GET error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
