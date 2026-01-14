/**
 * Graph Store
 *
 * Stores and queries entities and relations in Supabase.
 * Supports:
 * - CRUD operations for entities and relations
 * - Embedding-based similarity search for entities
 * - Graph traversal queries (BFS/DFS)
 */

import { createServerClient } from '@/lib/supabase';
import { createEmbedding } from '@/lib/ai';
import type {
  Entity,
  Relation,
  EntityInput,
  RelationInput,
  EntityQuery,
  RelationQuery,
  GraphStoreConfig,
  GraphPath,
  DbEntity,
  DbRelation,
  EntityType,
  RelationType,
} from '../types';

// ============================================
// Entity Operations
// ============================================

/**
 * Create a new entity in the store
 */
export async function createEntity(
  config: GraphStoreConfig,
  input: EntityInput
): Promise<Entity> {
  const supabase = createServerClient();

  // Generate embedding for entity name + description
  const embeddingText = input.description
    ? `${input.name}: ${input.description}`
    : input.name;
  const embedding = await createEmbedding(embeddingText);

  const { data, error } = await supabase
    .from('graph_entities')
    .insert({
      user_id: config.userId,
      collection_id: config.collectionId,
      name: input.name,
      aliases: input.aliases || [],
      type: input.type,
      description: input.description || null,
      embedding,
      confidence: input.confidence || 0.8,
      source_chunks: [input.sourceChunkId],
      metadata: input.metadata || {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create entity: ${error.message}`);
  }

  return dbEntityToEntity(data as DbEntity);
}

/**
 * Create multiple entities in batch
 */
export async function createEntities(
  config: GraphStoreConfig,
  inputs: EntityInput[]
): Promise<Entity[]> {
  if (inputs.length === 0) return [];

  const supabase = createServerClient();

  // Generate embeddings in parallel
  const embeddings = await Promise.all(
    inputs.map(input => {
      const text = input.description
        ? `${input.name}: ${input.description}`
        : input.name;
      return createEmbedding(text);
    })
  );

  // Prepare insert data
  const insertData = inputs.map((input, i) => ({
    user_id: config.userId,
    collection_id: config.collectionId,
    name: input.name,
    aliases: input.aliases || [],
    type: input.type,
    description: input.description || null,
    embedding: embeddings[i],
    confidence: input.confidence || 0.8,
    source_chunks: [input.sourceChunkId],
    metadata: input.metadata || {},
  }));

  const { data, error } = await supabase
    .from('graph_entities')
    .insert(insertData)
    .select();

  if (error) {
    throw new Error(`Failed to create entities: ${error.message}`);
  }

  return (data as DbEntity[]).map(dbEntityToEntity);
}

/**
 * Get entity by ID
 */
export async function getEntity(
  config: GraphStoreConfig,
  entityId: string
): Promise<Entity | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('graph_entities')
    .select()
    .eq('id', entityId)
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to get entity: ${error.message}`);
  }

  return dbEntityToEntity(data as DbEntity);
}

/**
 * Find similar entities by embedding
 */
export async function findSimilarEntities(
  config: GraphStoreConfig,
  query: EntityQuery
): Promise<Entity[]> {
  const supabase = createServerClient();

  if (query.embedding) {
    // Vector similarity search
    const { data, error } = await supabase.rpc('match_graph_entities', {
      query_embedding: query.embedding,
      match_threshold: query.minSimilarity || 0.7,
      match_count: query.limit || 10,
      p_user_id: config.userId,
      p_collection_id: config.collectionId,
    });

    if (error) {
      throw new Error(`Failed to find similar entities: ${error.message}`);
    }

    return (data as DbEntity[]).map(dbEntityToEntity);
  }

  // Fallback to regular query
  let queryBuilder = supabase
    .from('graph_entities')
    .select()
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId);

  if (query.name) {
    queryBuilder = queryBuilder.ilike('name', `%${query.name}%`);
  }

  if (query.type) {
    if (Array.isArray(query.type)) {
      queryBuilder = queryBuilder.in('type', query.type);
    } else {
      queryBuilder = queryBuilder.eq('type', query.type);
    }
  }

  if (query.limit) {
    queryBuilder = queryBuilder.limit(query.limit);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Failed to query entities: ${error.message}`);
  }

  return (data as DbEntity[]).map(dbEntityToEntity);
}

/**
 * Update an existing entity
 */
export async function updateEntity(
  config: GraphStoreConfig,
  entityId: string,
  updates: Partial<EntityInput>
): Promise<Entity> {
  const supabase = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.aliases !== undefined) updateData.aliases = updates.aliases;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.confidence !== undefined) updateData.confidence = updates.confidence;
  if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

  // Regenerate embedding if name or description changed
  if (updates.name !== undefined || updates.description !== undefined) {
    const text = updates.description
      ? `${updates.name || ''}: ${updates.description}`
      : updates.name || '';
    if (text) {
      updateData.embedding = await createEmbedding(text);
    }
  }

  const { data, error } = await supabase
    .from('graph_entities')
    .update(updateData)
    .eq('id', entityId)
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update entity: ${error.message}`);
  }

  return dbEntityToEntity(data as DbEntity);
}

/**
 * Delete an entity and its relations
 */
export async function deleteEntity(
  config: GraphStoreConfig,
  entityId: string
): Promise<void> {
  const supabase = createServerClient();

  // Delete related relations first
  await supabase
    .from('graph_relations')
    .delete()
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId)
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);

  // Delete entity
  const { error } = await supabase
    .from('graph_entities')
    .delete()
    .eq('id', entityId)
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId);

  if (error) {
    throw new Error(`Failed to delete entity: ${error.message}`);
  }
}

// ============================================
// Relation Operations
// ============================================

/**
 * Create a new relation
 */
export async function createRelation(
  config: GraphStoreConfig,
  input: RelationInput
): Promise<Relation> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('graph_relations')
    .insert({
      user_id: config.userId,
      collection_id: config.collectionId,
      source_entity_id: input.sourceEntityId,
      target_entity_id: input.targetEntityId,
      type: input.type,
      evidence: input.evidence || null,
      evidence_chunk_id: input.evidenceChunkId,
      confidence: input.confidence || 0.8,
      metadata: input.metadata || {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create relation: ${error.message}`);
  }

  return dbRelationToRelation(data as DbRelation);
}

/**
 * Create multiple relations in batch
 */
export async function createRelations(
  config: GraphStoreConfig,
  inputs: RelationInput[]
): Promise<Relation[]> {
  if (inputs.length === 0) return [];

  const supabase = createServerClient();

  const insertData = inputs.map(input => ({
    user_id: config.userId,
    collection_id: config.collectionId,
    source_entity_id: input.sourceEntityId,
    target_entity_id: input.targetEntityId,
    type: input.type,
    evidence: input.evidence || null,
    evidence_chunk_id: input.evidenceChunkId,
    confidence: input.confidence || 0.8,
    metadata: input.metadata || {},
  }));

  const { data, error } = await supabase
    .from('graph_relations')
    .insert(insertData)
    .select();

  if (error) {
    throw new Error(`Failed to create relations: ${error.message}`);
  }

  return (data as DbRelation[]).map(dbRelationToRelation);
}

/**
 * Query relations
 */
export async function queryRelations(
  config: GraphStoreConfig,
  query: RelationQuery
): Promise<Relation[]> {
  const supabase = createServerClient();

  let queryBuilder = supabase
    .from('graph_relations')
    .select()
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId);

  if (query.sourceEntityId) {
    queryBuilder = queryBuilder.eq('source_entity_id', query.sourceEntityId);
  }

  if (query.targetEntityId) {
    queryBuilder = queryBuilder.eq('target_entity_id', query.targetEntityId);
  }

  if (query.type) {
    if (Array.isArray(query.type)) {
      queryBuilder = queryBuilder.in('type', query.type);
    } else {
      queryBuilder = queryBuilder.eq('type', query.type);
    }
  }

  if (query.limit) {
    queryBuilder = queryBuilder.limit(query.limit);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Failed to query relations: ${error.message}`);
  }

  return (data as DbRelation[]).map(dbRelationToRelation);
}

/**
 * Get relations for an entity (both directions)
 */
export async function getEntityRelations(
  config: GraphStoreConfig,
  entityId: string,
  direction: 'outgoing' | 'incoming' | 'both' = 'both'
): Promise<Relation[]> {
  const supabase = createServerClient();

  let queryBuilder = supabase
    .from('graph_relations')
    .select()
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId);

  if (direction === 'outgoing') {
    queryBuilder = queryBuilder.eq('source_entity_id', entityId);
  } else if (direction === 'incoming') {
    queryBuilder = queryBuilder.eq('target_entity_id', entityId);
  } else {
    queryBuilder = queryBuilder.or(
      `source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`
    );
  }

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Failed to get entity relations: ${error.message}`);
  }

  return (data as DbRelation[]).map(dbRelationToRelation);
}

/**
 * Delete a relation
 */
export async function deleteRelation(
  config: GraphStoreConfig,
  relationId: string
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('graph_relations')
    .delete()
    .eq('id', relationId)
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId);

  if (error) {
    throw new Error(`Failed to delete relation: ${error.message}`);
  }
}

// ============================================
// Graph Traversal
// ============================================

interface TraversalOptions {
  maxDepth?: number;
  direction?: 'outgoing' | 'incoming' | 'both';
  relationTypes?: RelationType[];
  entityTypes?: EntityType[];
  maxNodes?: number;
}

/**
 * Traverse graph using BFS from starting entities
 */
export async function traverseGraph(
  config: GraphStoreConfig,
  startEntityIds: string[],
  options: TraversalOptions = {}
): Promise<GraphPath[]> {
  const {
    maxDepth = 2,
    direction = 'both',
    relationTypes,
    entityTypes,
    maxNodes = 100,
  } = options;

  const supabase = createServerClient();
  const visited = new Set<string>();
  const paths: GraphPath[] = [];

  // BFS queue: [entityId, path, depth]
  const queue: Array<[string, GraphPath, number]> = [];

  // Initialize with start entities
  for (const entityId of startEntityIds) {
    const entity = await getEntity(config, entityId);
    if (entity) {
      visited.add(entityId);
      queue.push([entityId, { nodes: [entity], edges: [], score: 1 }, 0]);
    }
  }

  while (queue.length > 0 && visited.size < maxNodes) {
    const [currentId, currentPath, depth] = queue.shift()!;

    if (depth >= maxDepth) {
      paths.push(currentPath);
      continue;
    }

    // Get relations for current entity
    const relations = await getEntityRelations(config, currentId, direction);

    // Filter by relation types if specified
    const filteredRelations = relationTypes
      ? relations.filter(r => relationTypes.includes(r.type))
      : relations;

    if (filteredRelations.length === 0) {
      paths.push(currentPath);
      continue;
    }

    let hasNewPath = false;

    for (const relation of filteredRelations) {
      const nextId = relation.sourceEntityId === currentId
        ? relation.targetEntityId
        : relation.sourceEntityId;

      if (visited.has(nextId)) continue;

      const nextEntity = await getEntity(config, nextId);
      if (!nextEntity) continue;

      // Filter by entity types if specified
      if (entityTypes && !entityTypes.includes(nextEntity.type)) continue;

      visited.add(nextId);
      hasNewPath = true;

      const newPath: GraphPath = {
        nodes: [...currentPath.nodes, nextEntity],
        edges: [...currentPath.edges, relation],
        score: currentPath.score * relation.confidence,
      };

      queue.push([nextId, newPath, depth + 1]);
    }

    if (!hasNewPath) {
      paths.push(currentPath);
    }
  }

  // Sort by score descending
  return paths.sort((a, b) => b.score - a.score);
}

/**
 * Find shortest path between two entities
 */
export async function findPath(
  config: GraphStoreConfig,
  sourceEntityId: string,
  targetEntityId: string,
  maxDepth: number = 5
): Promise<GraphPath | null> {
  const visited = new Set<string>();
  const queue: Array<[string, GraphPath]> = [];

  const sourceEntity = await getEntity(config, sourceEntityId);
  if (!sourceEntity) return null;

  visited.add(sourceEntityId);
  queue.push([sourceEntityId, { nodes: [sourceEntity], edges: [], score: 1 }]);

  while (queue.length > 0) {
    const [currentId, currentPath] = queue.shift()!;

    if (currentPath.nodes.length > maxDepth) continue;

    if (currentId === targetEntityId) {
      return currentPath;
    }

    const relations = await getEntityRelations(config, currentId, 'both');

    for (const relation of relations) {
      const nextId = relation.sourceEntityId === currentId
        ? relation.targetEntityId
        : relation.sourceEntityId;

      if (visited.has(nextId)) continue;
      visited.add(nextId);

      const nextEntity = await getEntity(config, nextId);
      if (!nextEntity) continue;

      const newPath: GraphPath = {
        nodes: [...currentPath.nodes, nextEntity],
        edges: [...currentPath.edges, relation],
        score: currentPath.score * relation.confidence,
      };

      if (nextId === targetEntityId) {
        return newPath;
      }

      queue.push([nextId, newPath]);
    }
  }

  return null;
}

// ============================================
// Utility Functions
// ============================================

function dbEntityToEntity(db: DbEntity): Entity {
  return {
    id: db.id,
    name: db.name,
    aliases: db.aliases || [],
    type: db.type,
    description: db.description || undefined,
    embedding: db.embedding || undefined,
    confidence: db.confidence,
    sourceChunks: db.source_chunks || [],
    metadata: db.metadata || {},
  };
}

function dbRelationToRelation(db: DbRelation): Relation {
  return {
    id: db.id,
    sourceEntityId: db.source_entity_id,
    targetEntityId: db.target_entity_id,
    type: db.type,
    evidence: db.evidence || undefined,
    evidenceChunkId: db.evidence_chunk_id,
    confidence: db.confidence,
    metadata: db.metadata || {},
  };
}

/**
 * Check if entity with same name exists (for deduplication)
 */
export async function findEntityByName(
  config: GraphStoreConfig,
  name: string,
  type?: EntityType
): Promise<Entity | null> {
  const supabase = createServerClient();

  let queryBuilder = supabase
    .from('graph_entities')
    .select()
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId)
    .eq('name', name);

  if (type) {
    queryBuilder = queryBuilder.eq('type', type);
  }

  const { data, error } = await queryBuilder.single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to find entity: ${error.message}`);
  }

  return dbEntityToEntity(data as DbEntity);
}

/**
 * Merge entity with existing one (add source chunks, update confidence)
 */
export async function mergeEntitySources(
  config: GraphStoreConfig,
  entityId: string,
  newSourceChunkId: string,
  newConfidence?: number
): Promise<Entity> {
  const supabase = createServerClient();

  const existing = await getEntity(config, entityId);
  if (!existing) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  const updatedSourceChunks = [...new Set([...existing.sourceChunks, newSourceChunkId])];
  const updatedConfidence = newConfidence
    ? Math.min(1, (existing.confidence + newConfidence) / 2 + 0.1)
    : existing.confidence;

  const { data, error } = await supabase
    .from('graph_entities')
    .update({
      source_chunks: updatedSourceChunks,
      confidence: updatedConfidence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entityId)
    .eq('user_id', config.userId)
    .eq('collection_id', config.collectionId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to merge entity: ${error.message}`);
  }

  return dbEntityToEntity(data as DbEntity);
}
