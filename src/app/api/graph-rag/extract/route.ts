import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  extractEntities,
  extractRelations,
  findEntityByName,
  mergeEntitySources,
} from '@/lib/graph-rag';

import type {
  ChunkInput,
  ExtractionOptions,
  RelationInput,
  Entity,
  Relation,
  EntityType,
} from '@/lib/graph-rag';


/**
 * POST /api/graph-rag/extract
 *
 * Extract entities and relations from text chunks and store them in the graph.
 *
 * Request Body:
 * {
 *   "collection_id": "uuid",           // Required: collection to store graph in
 *   "chunks": [                         // Required: text chunks to process
 *     { "id": "chunk_1", "content": "..." },
 *     { "id": "chunk_2", "content": "..." }
 *   ],
 *   "options": {
 *     "use_llm": true,                  // Use LLM extraction (default: true)
 *     "use_rules": true,                // Use rule-based extraction (default: true)
 *     "model": "haiku",                 // "haiku" or "sonnet" (default: haiku)
 *     "entity_types": ["person", ...],  // Entity types to extract (default: all)
 *     "min_confidence": 0.5,            // Minimum confidence threshold
 *     "max_entities_per_chunk": 50,     // Max entities per chunk
 *     "deduplicate": true               // Merge with existing entities (default: true)
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "entities": [...],
 *   "relations": [...],
 *   "stats": {
 *     "chunks_processed": 2,
 *     "entities_extracted": 15,
 *     "entities_created": 12,
 *     "entities_merged": 3,
 *     "relations_extracted": 8,
 *     "processing_time_ms": 1234
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    const collectionId = body?.collection_id;
    const chunks = body?.chunks;

    if (!collectionId || typeof collectionId !== 'string') {
      return ValidationErrors.missingField('collection_id');
    }

    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return ValidationErrors.missingField('chunks');
    }

    // Validate chunks format
    const validChunks: ChunkInput[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk?.id || typeof chunk.id !== 'string') {
        return ValidationErrors.invalidField(`chunks[${i}].id`, 'must be a string');
      }
      if (!chunk?.content || typeof chunk.content !== 'string') {
        return ValidationErrors.invalidField(`chunks[${i}].content`, 'must be a string');
      }
      validChunks.push({
        id: chunk.id,
        content: chunk.content,
        metadata: chunk.metadata || {},
      });
    }

    // Parse options
    const rawOptions = (body?.options || {}) as Record<string, unknown>;
    const options: ExtractionOptions = {
      useLlm: rawOptions.use_llm !== false,
      useRules: rawOptions.use_rules !== false,
      model: rawOptions.model === 'sonnet' ? 'sonnet' : 'haiku',
      entityTypes: Array.isArray(rawOptions.entity_types)
        ? rawOptions.entity_types as EntityType[]
        : undefined,
      minConfidence: typeof rawOptions.min_confidence === 'number'
        ? rawOptions.min_confidence
        : 0.5,
      maxEntitiesPerChunk: typeof rawOptions.max_entities_per_chunk === 'number'
        ? rawOptions.max_entities_per_chunk
        : 50,
    };

    const deduplicate = rawOptions.deduplicate !== false;

    const config = {
      userId,
      collectionId,
    };

    // Extract entities
    const entityResult = await extractEntities(validChunks, options);

    // Extract relations
    const relationResult = await extractRelations(
      validChunks,
      entityResult.entities,
      options
    );

    // Store entities with deduplication
    const createdEntities: Entity[] = [];
    const mergedEntities: Entity[] = [];
    const entityIdMap = new Map<string, string>(); // temp ID -> real ID

    for (const input of entityResult.entities) {
      try {
        if (deduplicate) {
          // Check if entity already exists
          const existing = await findEntityByName(config, input.name, input.type);
          if (existing) {
            // Merge with existing
            const merged = await mergeEntitySources(
              config,
              existing.id,
              input.sourceChunkId,
              input.confidence
            );
            mergedEntities.push(merged);
            // Map temp ID to real ID
            const tempId = `ent_${input.name.toLowerCase().replace(/\s+/g, '_')}`;
            entityIdMap.set(tempId, merged.id);
            continue;
          }
        }

        // Create new entity
        const entity = await createEntity(config, input);
        createdEntities.push(entity);
        const tempId = `ent_${input.name.toLowerCase().replace(/\s+/g, '_')}`;
        entityIdMap.set(tempId, entity.id);
      } catch (error) {
        console.error('Failed to create entity:', input.name, error);
      }
    }

    // Update relation entity IDs with real IDs
    const validRelations: RelationInput[] = [];
    for (const input of relationResult.relations) {
      const sourceId = entityIdMap.get(input.sourceEntityId);
      const targetId = entityIdMap.get(input.targetEntityId);

      if (sourceId && targetId) {
        validRelations.push({
          ...input,
          sourceEntityId: sourceId,
          targetEntityId: targetId,
        });
      }
    }

    // Store relations
    const createdRelations: Relation[] = [];
    for (const input of validRelations) {
      try {
        const relation = await createRelation(config, input);
        createdRelations.push(relation);
      } catch (error) {
        console.error('Failed to create relation:', error);
      }
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/graph-rag/extract', method: 'POST', startTime },
      200
    );

    const response = NextResponse.json(
      {
        success: true,
        entities: [...createdEntities, ...mergedEntities],
        relations: createdRelations,
        stats: {
          chunks_processed: validChunks.length,
          entities_extracted: entityResult.entities.length,
          entities_created: createdEntities.length,
          entities_merged: mergedEntities.length,
          relations_extracted: relationResult.relations.length,
          relations_created: createdRelations.length,
          processing_time_ms: Date.now() - startTime,
        },
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Graph extraction error:', error);
    return ServerErrors.internal('graph_extraction');
  }
}

// Import createEntity and createRelation from store
import { createEntity, createRelation } from '@/lib/graph-rag/store/graph-store';

/**
 * GET /api/graph-rag/extract
 *
 * Returns API documentation for the extract endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/graph-rag/extract',
    method: 'POST',
    description: 'Extract entities and relations from text chunks',
    authentication: 'x-api-key header required',
    request_body: {
      collection_id: {
        type: 'string (UUID)',
        required: true,
        description: 'Collection ID to store graph in',
      },
      chunks: {
        type: 'array',
        required: true,
        description: 'Text chunks to process',
        item_schema: {
          id: 'Unique chunk ID',
          content: 'Text content',
          metadata: 'Optional metadata object',
        },
      },
      options: {
        type: 'object',
        required: false,
        properties: {
          use_llm: {
            type: 'boolean',
            default: true,
            description: 'Use LLM for extraction',
          },
          use_rules: {
            type: 'boolean',
            default: true,
            description: 'Use rule-based patterns',
          },
          model: {
            type: 'string',
            enum: ['haiku', 'sonnet'],
            default: 'haiku',
            description: 'LLM model to use',
          },
          entity_types: {
            type: 'array',
            description: 'Entity types to extract',
            enum: [
              'person',
              'organization',
              'location',
              'concept',
              'technology',
              'method',
              'event',
              'product',
              'document',
              'custom',
            ],
          },
          min_confidence: {
            type: 'number',
            default: 0.5,
            range: '0-1',
            description: 'Minimum confidence threshold',
          },
          max_entities_per_chunk: {
            type: 'number',
            default: 50,
            description: 'Maximum entities per chunk',
          },
          deduplicate: {
            type: 'boolean',
            default: true,
            description: 'Merge with existing entities',
          },
        },
      },
    },
    response: {
      success: 'boolean',
      entities: 'Array of created/merged entities',
      relations: 'Array of created relations',
      stats: {
        chunks_processed: 'Number of chunks processed',
        entities_extracted: 'Total entities extracted',
        entities_created: 'New entities created',
        entities_merged: 'Entities merged with existing',
        relations_extracted: 'Total relations extracted',
        relations_created: 'Relations stored',
        processing_time_ms: 'Total processing time',
      },
    },
  });
}
