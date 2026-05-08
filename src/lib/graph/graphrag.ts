/**
 * Graph Memory (GraphRAG)
 *
 * Entity-relationship extraction and graph-based retrieval:
 * - Knowledge graph construction from documents
 * - Entity extraction using LLM
 * - Relationship inference
 * - Graph-augmented retrieval
 *
 * @module graph/graphrag
 */

import { createServerClient } from '@/lib/supabase';
import { escapePostgrestOrFilter } from '@/lib/postgrest-filters';
import Anthropic from '@anthropic-ai/sdk';

// ============================================
// Types
// ============================================

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'concept'
  | 'event'
  | 'product'
  | 'technology'
  | 'document'
  | 'custom';

export type RelationType =
  | 'related_to'
  | 'part_of'
  | 'created_by'
  | 'located_in'
  | 'works_for'
  | 'owns'
  | 'uses'
  | 'mentions'
  | 'causes'
  | 'precedes'
  | 'follows'
  | 'similar_to'
  | 'custom';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  description?: string;
  aliases?: string[];
  properties?: Record<string, unknown>;
  embedding?: number[];
  sourceDocuments?: string[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationType;
  label?: string;
  properties?: Record<string, unknown>;
  weight: number;
  confidence: number;
  sourceDocument?: string;
  createdAt: string;
}

export interface KnowledgeGraph {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  entityCount: number;
  relationshipCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
  documentId: string;
  confidence: number;
  processingTime: number;
}

export interface GraphSearchResult {
  entity: Entity;
  score: number;
  path?: Array<{
    entity: Entity;
    relationship: Relationship;
  }>;
  context?: string[];
}

export interface GraphRAGContext {
  entities: Entity[];
  relationships: Relationship[];
  subgraph: string;
  relevanceScore: number;
}

// ============================================
// Entity Extractor
// ============================================

export class EntityExtractor {
  private anthropic?: Anthropic;
  private openRouterModel: string = process.env.GRAPHRAG_OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5';
  private anthropicModel: string = process.env.GRAPHRAG_ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
  private baseUrl: string = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';

  constructor() {}

  /**
   * Extract entities and relationships from text
   */
  async extract(
    text: string,
    options: {
      entityTypes?: EntityType[];
      maxEntities?: number;
      minConfidence?: number;
    } = {}
  ): Promise<{ entities: Entity[]; relationships: Relationship[] }> {
    const entityTypes = options.entityTypes || [
      'person',
      'organization',
      'location',
      'concept',
      'technology',
    ];

    const prompt = `Extract entities and relationships from the following text.

Text:
${text}

Instructions:
1. Identify entities of these types: ${entityTypes.join(', ')}
2. Extract relationships between entities
3. Assign confidence scores (0-1) based on how clearly the entity/relationship is stated
4. Include any relevant properties or attributes

Output as JSON:
{
  "entities": [
    {
      "name": "string",
      "type": "entity type",
      "description": "brief description",
      "aliases": ["alternative names"],
      "properties": {},
      "confidence": 0.0-1.0
    }
  ],
  "relationships": [
    {
      "source": "source entity name",
      "target": "target entity name",
      "type": "relationship type",
      "label": "human readable label",
      "confidence": 0.0-1.0
    }
  ]
}

Only output valid JSON, no other text.`;

    const responseText = process.env.OPENROUTER_API_KEY
      ? await this.extractViaOpenRouter(prompt)
      : await this.extractViaAnthropic(prompt);

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse extraction result');
      }
    }

    const now = new Date().toISOString();
    const minConfidence = options.minConfidence || 0.5;

    const entities: Entity[] = (parsed.entities || [])
      .filter((e: { confidence?: number }) => (e.confidence || 0) >= minConfidence)
      .slice(0, options.maxEntities || 100)
      .map((e: { name: string; type: EntityType; description?: string; aliases?: string[]; properties?: Record<string, unknown>; confidence?: number }) => ({
        id: crypto.randomUUID(),
        type: e.type as EntityType,
        name: e.name,
        description: e.description,
        aliases: e.aliases,
        properties: e.properties,
        confidence: e.confidence || 0.8,
        createdAt: now,
        updatedAt: now,
      }));

    // Map entity names to IDs
    const entityNameToId = new Map(entities.map((e) => [e.name.toLowerCase(), e.id]));

    const relationships: Relationship[] = (parsed.relationships || [])
      .filter((r: { confidence?: number }) => (r.confidence || 0) >= minConfidence)
      .map((r: { source: string; target: string; type: RelationType; label?: string; confidence?: number }) => {
        const sourceId = entityNameToId.get(r.source.toLowerCase());
        const targetId = entityNameToId.get(r.target.toLowerCase());

        if (!sourceId || !targetId) return null;

        return {
          id: crypto.randomUUID(),
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          type: r.type as RelationType,
          label: r.label,
          weight: 1.0,
          confidence: r.confidence || 0.8,
          createdAt: now,
        };
      })
      .filter(Boolean) as Relationship[];

    return { entities, relationships };
  }

  private async extractViaOpenRouter(prompt: string): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not set');
    }

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://www.seizn.com',
        'X-Title': 'Seizn GraphRAG',
      },
      body: JSON.stringify({
        model: this.openRouterModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!resp.ok) {
      throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    const responseText = data?.choices?.[0]?.message?.content;
    if (typeof responseText !== 'string' || responseText.length === 0) {
      throw new Error('Empty response from OpenRouter');
    }
    return responseText;
  }

  private async extractViaAnthropic(prompt: string): Promise<string> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('OPENROUTER_API_KEY or ANTHROPIC_API_KEY not set');
    }

    this.anthropic ??= new Anthropic();
    const response = await this.anthropic.messages.create({
      model: this.anthropicModel,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content?.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    return content.text;
  }

  /**
   * Merge duplicate entities
   */
  mergeEntities(
    existing: Entity[],
    newEntities: Entity[],
    similarityThreshold: number = 0.85
  ): Entity[] {
    const merged: Entity[] = [...existing];

    for (const newEntity of newEntities) {
      const matchingEntity = merged.find(
        (e) =>
          e.name.toLowerCase() === newEntity.name.toLowerCase() ||
          e.aliases?.some(
            (a) =>
              a.toLowerCase() === newEntity.name.toLowerCase() ||
              newEntity.aliases?.some((na) => na.toLowerCase() === a.toLowerCase())
          )
      );

      if (matchingEntity) {
        // Merge properties and aliases
        matchingEntity.aliases = [
          ...new Set([
            ...(matchingEntity.aliases || []),
            ...(newEntity.aliases || []),
          ]),
        ];
        matchingEntity.properties = {
          ...matchingEntity.properties,
          ...newEntity.properties,
        };
        matchingEntity.confidence = Math.max(
          matchingEntity.confidence,
          newEntity.confidence
        );
        matchingEntity.updatedAt = new Date().toISOString();
      } else {
        merged.push(newEntity);
      }
    }

    return merged;
  }
}

// ============================================
// Knowledge Graph Store
// ============================================

export class KnowledgeGraphStore {
  private supabase = createServerClient();

  /**
   * Create a new knowledge graph
   */
  async createGraph(params: {
    organizationId: string;
    name: string;
    description?: string;
  }): Promise<KnowledgeGraph> {
    const { data, error } = await this.supabase
      .from('knowledge_graphs')
      .insert({
        organization_id: params.organizationId,
        name: params.name,
        description: params.description,
        entity_count: 0,
        relationship_count: 0,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create graph: ${error.message}`);

    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      description: data.description,
      entityCount: data.entity_count,
      relationshipCount: data.relationship_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Add entities to graph
   */
  async addEntities(graphId: string, entities: Entity[]): Promise<void> {
    const rows = entities.map((e) => ({
      id: e.id,
      graph_id: graphId,
      type: e.type,
      name: e.name,
      description: e.description,
      aliases: e.aliases,
      properties: e.properties,
      embedding: e.embedding,
      source_documents: e.sourceDocuments,
      confidence: e.confidence,
    }));

    const { error } = await this.supabase.from('graph_entities').insert(rows);

    if (error) throw new Error(`Failed to add entities: ${error.message}`);

    // Update entity count
    await this.supabase.rpc('increment_graph_entity_count', {
      p_graph_id: graphId,
      p_count: entities.length,
    });
  }

  /**
   * Add relationships to graph
   */
  async addRelationships(graphId: string, relationships: Relationship[]): Promise<void> {
    const rows = relationships.map((r) => ({
      id: r.id,
      graph_id: graphId,
      source_entity_id: r.sourceEntityId,
      target_entity_id: r.targetEntityId,
      type: r.type,
      label: r.label,
      properties: r.properties,
      weight: r.weight,
      confidence: r.confidence,
      source_document: r.sourceDocument,
    }));

    const { error } = await this.supabase.from('graph_relationships').insert(rows);

    if (error) throw new Error(`Failed to add relationships: ${error.message}`);

    // Update relationship count
    await this.supabase.rpc('increment_graph_relationship_count', {
      p_graph_id: graphId,
      p_count: relationships.length,
    });
  }

  /**
   * Search entities by name
   */
  async searchEntities(
    graphId: string,
    query: string,
    limit: number = 10
  ): Promise<Entity[]> {
    const safeQuery = escapePostgrestOrFilter(query);
    if (!safeQuery) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('graph_entities')
      .select('*')
      .eq('graph_id', graphId)
      .or(`name.ilike.%${safeQuery}%,aliases.cs.{${safeQuery}}`)
      .limit(limit);

    if (error) throw new Error(`Failed to search entities: ${error.message}`);

    return (data || []).map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      description: e.description,
      aliases: e.aliases,
      properties: e.properties,
      embedding: e.embedding,
      sourceDocuments: e.source_documents,
      confidence: e.confidence,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));
  }

  /**
   * Get entity neighbors (connected entities)
   */
  async getNeighbors(
    entityId: string,
    depth: number = 1,
    limit: number = 50
  ): Promise<{ entities: Entity[]; relationships: Relationship[] }> {
    // Get relationships where entity is source or target
    const { data: rels } = await this.supabase
      .from('graph_relationships')
      .select('*')
      .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)
      .limit(limit);

    if (!rels || rels.length === 0) {
      return { entities: [], relationships: [] };
    }

    // Get connected entity IDs
    const connectedIds = new Set<string>();
    for (const r of rels) {
      if (r.source_entity_id !== entityId) connectedIds.add(r.source_entity_id);
      if (r.target_entity_id !== entityId) connectedIds.add(r.target_entity_id);
    }

    // Get connected entities
    const { data: entities } = await this.supabase
      .from('graph_entities')
      .select('*')
      .in('id', Array.from(connectedIds));

    const relationships: Relationship[] = rels.map((r) => ({
      id: r.id,
      sourceEntityId: r.source_entity_id,
      targetEntityId: r.target_entity_id,
      type: r.type,
      label: r.label,
      properties: r.properties,
      weight: r.weight,
      confidence: r.confidence,
      sourceDocument: r.source_document,
      createdAt: r.created_at,
    }));

    const entityList: Entity[] = (entities || []).map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      description: e.description,
      aliases: e.aliases,
      properties: e.properties,
      confidence: e.confidence,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));

    return { entities: entityList, relationships };
  }

  /**
   * Find shortest path between two entities
   */
  async findPath(
    sourceEntityId: string,
    targetEntityId: string,
    maxDepth: number = 5
  ): Promise<Array<{ entity: Entity; relationship?: Relationship }>> {
    // BFS path finding
    const visited = new Set<string>();
    const queue: Array<{
      entityId: string;
      path: Array<{ entityId: string; relationshipId?: string }>;
    }> = [{ entityId: sourceEntityId, path: [{ entityId: sourceEntityId }] }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.entityId === targetEntityId) {
        // Fetch full entities and relationships for path
        return this.hydratePath(current.path);
      }

      if (visited.has(current.entityId) || current.path.length > maxDepth) {
        continue;
      }

      visited.add(current.entityId);

      const { entities, relationships } = await this.getNeighbors(current.entityId, 1, 20);

      for (const rel of relationships) {
        const nextEntityId =
          rel.sourceEntityId === current.entityId
            ? rel.targetEntityId
            : rel.sourceEntityId;

        if (!visited.has(nextEntityId)) {
          queue.push({
            entityId: nextEntityId,
            path: [...current.path, { entityId: nextEntityId, relationshipId: rel.id }],
          });
        }
      }
    }

    return [];
  }

  private async hydratePath(
    path: Array<{ entityId: string; relationshipId?: string }>
  ): Promise<Array<{ entity: Entity; relationship?: Relationship }>> {
    const entityIds = path.map((p) => p.entityId);
    const relationshipIds = path
      .filter((p) => p.relationshipId)
      .map((p) => p.relationshipId!);

    const { data: entities } = await this.supabase
      .from('graph_entities')
      .select('*')
      .in('id', entityIds);

    const { data: relationships } = await this.supabase
      .from('graph_relationships')
      .select('*')
      .in('id', relationshipIds);

    const entityMap = new Map((entities || []).map((e) => [e.id, e]));
    const relMap = new Map((relationships || []).map((r) => [r.id, r]));

    return path.map((p) => {
      const e = entityMap.get(p.entityId);
      const r = p.relationshipId ? relMap.get(p.relationshipId) : undefined;

      return {
        entity: e
          ? {
              id: e.id,
              type: e.type,
              name: e.name,
              description: e.description,
              aliases: e.aliases,
              properties: e.properties,
              confidence: e.confidence,
              createdAt: e.created_at,
              updatedAt: e.updated_at,
            }
          : { id: p.entityId, type: 'custom' as EntityType, name: 'Unknown', confidence: 0, createdAt: '', updatedAt: '' },
        relationship: r
          ? {
              id: r.id,
              sourceEntityId: r.source_entity_id,
              targetEntityId: r.target_entity_id,
              type: r.type,
              label: r.label,
              weight: r.weight,
              confidence: r.confidence,
              createdAt: r.created_at,
            }
          : undefined,
      };
    });
  }
}

// ============================================
// GraphRAG Retriever
// ============================================

export class GraphRAGRetriever {
  private store: KnowledgeGraphStore;
  private extractor: EntityExtractor;

  constructor() {
    this.store = new KnowledgeGraphStore();
    this.extractor = new EntityExtractor();
  }

  /**
   * Build graph context from query
   */
  async buildContext(
    graphId: string,
    query: string,
    options: {
      maxEntities?: number;
      maxDepth?: number;
      includeRelationships?: boolean;
    } = {}
  ): Promise<GraphRAGContext> {
    const maxEntities = options.maxEntities || 10;
    const maxDepth = options.maxDepth || 2;
    const includeRelationships = options.includeRelationships ?? true;

    // Extract entities from query
    const { entities: queryEntities } = await this.extractor.extract(query, {
      maxEntities: 5,
      minConfidence: 0.3,
    });

    // Find matching entities in graph
    const foundEntities: Entity[] = [];
    for (const qe of queryEntities) {
      const matches = await this.store.searchEntities(graphId, qe.name, 3);
      foundEntities.push(...matches);
    }

    // Also search by raw query terms
    const queryTerms = query.split(/\s+/).filter((t) => t.length > 3);
    for (const term of queryTerms.slice(0, 5)) {
      const matches = await this.store.searchEntities(graphId, term, 2);
      foundEntities.push(...matches);
    }

    // Deduplicate
    const uniqueEntities = Array.from(
      new Map(foundEntities.map((e) => [e.id, e])).values()
    ).slice(0, maxEntities);

    // Get relationships
    const allRelationships: Relationship[] = [];
    if (includeRelationships) {
      for (const entity of uniqueEntities) {
        const { relationships } = await this.store.getNeighbors(entity.id, 1, 10);
        allRelationships.push(...relationships);
      }
    }

    // Deduplicate relationships
    const uniqueRelationships = Array.from(
      new Map(allRelationships.map((r) => [r.id, r])).values()
    );

    // Build subgraph description
    const subgraph = this.buildSubgraphDescription(uniqueEntities, uniqueRelationships);

    // Calculate relevance score
    const relevanceScore = this.calculateRelevance(query, uniqueEntities);

    return {
      entities: uniqueEntities,
      relationships: uniqueRelationships,
      subgraph,
      relevanceScore,
    };
  }

  /**
   * Augment retrieval context with graph information
   */
  async augmentContext(
    graphId: string,
    query: string,
    retrievedChunks: Array<{ content: string; metadata?: Record<string, unknown> }>
  ): Promise<{
    chunks: Array<{ content: string; metadata?: Record<string, unknown> }>;
    graphContext: GraphRAGContext;
  }> {
    const graphContext = await this.buildContext(graphId, query);

    // Add graph context as additional chunk
    if (graphContext.entities.length > 0) {
      const graphChunk = {
        content: `Knowledge Graph Context:\n${graphContext.subgraph}`,
        metadata: {
          source: 'knowledge_graph',
          entity_count: graphContext.entities.length,
          relationship_count: graphContext.relationships.length,
        },
      };

      return {
        chunks: [graphChunk, ...retrievedChunks],
        graphContext,
      };
    }

    return { chunks: retrievedChunks, graphContext };
  }

  private buildSubgraphDescription(
    entities: Entity[],
    relationships: Relationship[]
  ): string {
    const lines: string[] = [];

    // Describe entities
    lines.push('Entities:');
    for (const entity of entities) {
      let line = `- ${entity.name} (${entity.type})`;
      if (entity.description) {
        line += `: ${entity.description}`;
      }
      lines.push(line);
    }

    // Describe relationships
    if (relationships.length > 0) {
      lines.push('\nRelationships:');
      const entityMap = new Map(entities.map((e) => [e.id, e.name]));

      for (const rel of relationships) {
        const sourceName = entityMap.get(rel.sourceEntityId) || 'Unknown';
        const targetName = entityMap.get(rel.targetEntityId) || 'Unknown';
        const label = rel.label || rel.type.replace(/_/g, ' ');
        lines.push(`- ${sourceName} ${label} ${targetName}`);
      }
    }

    return lines.join('\n');
  }

  private calculateRelevance(query: string, entities: Entity[]): number {
    if (entities.length === 0) return 0;

    const queryLower = query.toLowerCase();
    let matchScore = 0;

    for (const entity of entities) {
      if (queryLower.includes(entity.name.toLowerCase())) {
        matchScore += entity.confidence;
      }
      if (entity.aliases?.some((a) => queryLower.includes(a.toLowerCase()))) {
        matchScore += entity.confidence * 0.5;
      }
    }

    return Math.min(1, matchScore / entities.length);
  }
}

// ============================================
// Factory functions
// ============================================

export function createEntityExtractor(): EntityExtractor {
  return new EntityExtractor();
}

export function createKnowledgeGraphStore(): KnowledgeGraphStore {
  return new KnowledgeGraphStore();
}

export function createGraphRAGRetriever(): GraphRAGRetriever {
  return new GraphRAGRetriever();
}
