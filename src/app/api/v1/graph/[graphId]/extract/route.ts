/**
 * Graph Entity Extraction API
 *
 * POST /api/v1/graph/:graphId/extract - Extract entities from text
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiScope } from '@/lib/auth/api-scope';
import { createServerClient } from '@/lib/supabase';
import {
  createEntityExtractor,
  createKnowledgeGraphStore,
  type EntityType,
} from '@/lib/graph/graphrag';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ graphId: string }>;
}

interface ExtractRequest {
  text: string;
  document_id?: string;
  entity_types?: EntityType[];
  max_entities?: number;
  min_confidence?: number;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiScope(request, 'graph:write');
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { graphId } = await params;
    const body = (await request.json()) as ExtractRequest;

    if (!body.text) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'text is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify graph access
    const { data: graph } = await supabase
      .from('knowledge_graphs')
      .select('id')
      .eq('id', graphId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!graph) {
      return NextResponse.json({ error: 'Not Found', message: 'Graph not found' }, { status: 404 });
    }

    const startTime = Date.now();

    // Extract entities and relationships
    const extractor = createEntityExtractor();
    const { entities, relationships } = await extractor.extract(body.text, {
      entityTypes: body.entity_types,
      maxEntities: body.max_entities || 50,
      minConfidence: body.min_confidence || 0.5,
    });

    // Add source document tracking
    const documentId = body.document_id || crypto.randomUUID();
    for (const entity of entities) {
      entity.sourceDocuments = [documentId];
    }
    for (const rel of relationships) {
      rel.sourceDocument = documentId;
    }

    // Store in graph
    const store = createKnowledgeGraphStore();
    if (entities.length > 0) {
      await store.addEntities(graphId, entities);
    }
    if (relationships.length > 0) {
      await store.addRelationships(graphId, relationships);
    }

    const processingTime = Date.now() - startTime;

    // Log extraction
    await supabase.from('graph_extraction_history').insert({
      graph_id: graphId,
      document_id: documentId,
      entities_extracted: entities.length,
      relationships_extracted: relationships.length,
      processing_time_ms: processingTime,
      status: 'completed',
    });

    return NextResponse.json({
      extraction: {
        document_id: documentId,
        entities_extracted: entities.length,
        relationships_extracted: relationships.length,
        processing_time_ms: processingTime,
        entities: entities.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.name,
          description: e.description,
          confidence: e.confidence,
        })),
        relationships: relationships.map((r) => ({
          id: r.id,
          source_entity_id: r.sourceEntityId,
          target_entity_id: r.targetEntityId,
          type: r.type,
          label: r.label,
          confidence: r.confidence,
        })),
      },
    });
  } catch (error) {
    logServerError('[GraphExtract] POST error', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
