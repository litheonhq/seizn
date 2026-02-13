/**
 * Evidence Pack API
 *
 * POST /api/v1/evidence - Create evidence pack
 * GET /api/v1/evidence - List evidence packs
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  createEvidencePackBuilder,
  createEvidencePackStore,
  type EvidencePack,
} from '@/lib/provenance/evidence-pack';

interface CreateEvidenceRequest {
  trace_id?: string;
  purpose?: string;
  rag_interaction?: {
    query: string;
    query_id: string;
    contexts: Array<{ id: string; content: string; source: string }>;
    response: string;
    response_id: string;
    model_id: string;
  };
  entities?: Array<{
    id: string;
    label?: string;
    value?: unknown;
    generated_at?: string;
  }>;
  activities?: Array<{
    id: string;
    label?: string;
    started_at?: string;
    ended_at?: string;
  }>;
  agents?: Array<{
    id: string;
    label?: string;
    type?: 'Person' | 'Organization' | 'SoftwareAgent';
  }>;
  relations?: {
    generations?: Array<{ entity: string; activity: string }>;
    usages?: Array<{ activity: string; entity: string; role?: string }>;
    derivations?: Array<{ generated: string; used: string; type?: string }>;
    attributions?: Array<{ entity: string; agent: string }>;
    associations?: Array<{ activity: string; agent: string; role?: string }>;
  };
  sign?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const body = (await request.json()) as CreateEvidenceRequest;

    const builder = createEvidencePackBuilder(auth.organizationId!, {
      traceId: body.trace_id,
      purpose: body.purpose,
    });

    // Build from RAG interaction if provided
    if (body.rag_interaction) {
      const rag = body.rag_interaction;
      builder.addRagInteraction({
        query: rag.query,
        queryId: rag.query_id,
        contexts: rag.contexts,
        response: rag.response,
        responseId: rag.response_id,
        modelId: rag.model_id,
        userId: auth.userId,
      });
    }

    // Add custom entities
    if (body.entities) {
      for (const entity of body.entities) {
        builder.addEntity({
          id: entity.id,
          label: entity.label,
          value: entity.value,
          generatedAtTime: entity.generated_at,
        });
      }
    }

    // Add custom activities
    if (body.activities) {
      for (const activity of body.activities) {
        builder.addActivity({
          id: activity.id,
          label: activity.label,
          startedAtTime: activity.started_at,
          endedAtTime: activity.ended_at,
        });
      }
    }

    // Add custom agents
    if (body.agents) {
      for (const agent of body.agents) {
        builder.addAgent({
          id: agent.id,
          label: agent.label,
          agentType: agent.type,
        });
      }
    }

    // Add custom relations
    if (body.relations) {
      const rel = body.relations;

      if (rel.generations) {
        for (const gen of rel.generations) {
          builder.recordGeneration(gen.entity, gen.activity);
        }
      }

      if (rel.usages) {
        for (const use of rel.usages) {
          builder.recordUsage(use.activity, use.entity, use.role);
        }
      }

      if (rel.derivations) {
        for (const der of rel.derivations) {
          builder.recordDerivation(
            der.generated,
            der.used,
            undefined,
            der.type as 'prov:Revision' | 'prov:Quotation' | 'prov:PrimarySource' | undefined
          );
        }
      }

      if (rel.attributions) {
        for (const attr of rel.attributions) {
          builder.recordAttribution(attr.entity, attr.agent);
        }
      }

      if (rel.associations) {
        for (const assoc of rel.associations) {
          builder.recordAssociation(assoc.activity, assoc.agent, assoc.role);
        }
      }
    }

    const shouldSign = body.sign === true;

    let pack: EvidencePack;
    if (shouldSign) {
      try {
        pack = await builder.buildSignedWithKMS();
      } catch (signError) {
        return NextResponse.json(
          {
            error: 'Signing failed',
            message: signError instanceof Error ? signError.message : 'Unknown signing error',
          },
          { status: 422 }
        );
      }
    } else {
      pack = builder.build();
    }

    // Store pack
    const store = createEvidencePackStore();
    await store.store(pack);

    return NextResponse.json({
      evidence_pack: {
        id: pack.id,
        version: pack.version,
        created: pack.created,
        hash: pack.hash,
        has_signature: !!pack.signature,
        signature_algorithm: pack.signature?.algorithm,
        entity_count: Object.keys(pack.provenance.entity).length,
        activity_count: Object.keys(pack.provenance.activity).length,
        agent_count: Object.keys(pack.provenance.agent).length,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[Evidence] POST error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const traceId = searchParams.get('trace_id');

    const store = createEvidencePackStore();

    if (traceId) {
      const packs = await store.queryByTrace(traceId);
      return NextResponse.json({
        evidence_packs: packs.map((p) => ({
          id: p.id,
          version: p.version,
          created: p.created,
          hash: p.hash,
          purpose: p.metadata.purpose,
          entity_count: Object.keys(p.provenance.entity).length,
        })),
      });
    }

    // Return info about endpoint
    return NextResponse.json({
      description: 'Evidence Pack API for W3C PROV-compliant provenance tracking',
      endpoints: {
        'POST /api/v1/evidence': 'Create new evidence pack',
        'GET /api/v1/evidence?trace_id=xxx': 'List evidence packs by trace',
        'GET /api/v1/evidence/:id': 'Get specific evidence pack',
        'GET /api/v1/evidence/:id/verify': 'Verify evidence pack integrity',
        'GET /api/v1/evidence/:id/export?format=prov-json': 'Export as PROV-JSON',
        'GET /api/v1/evidence/:id/export?format=prov-n': 'Export as PROV-N',
        'GET /api/v1/evidence/:id/export?format=zip': 'Export as signed zip (provenance + policy + PII + trace digest)',
        'GET /api/v1/evidence/:id/trace/:entityId': 'Trace derivation chain',
      },
    });
  } catch (error) {
    console.error('[Evidence] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
