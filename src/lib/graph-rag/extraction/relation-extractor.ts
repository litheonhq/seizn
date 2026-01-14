/**
 * Relation Extractor
 *
 * Extracts relations between entities using:
 * 1. LLM-based extraction (Claude Haiku/Sonnet)
 * 2. Rule-based pattern matching
 */

import type {
  RelationInput,
  RelationType,
  EntityInput,
  ChunkInput,
  ExtractionOptions,
} from '../types';

// ============================================
// Constants
// ============================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Relation type descriptions for LLM
const RELATION_DESCRIPTIONS: Record<RelationType, string> = {
  is_a: 'Inheritance or type relationship (X is a type of Y)',
  part_of: 'Composition relationship (X is part of Y)',
  belongs_to: 'Ownership or membership (X belongs to Y)',
  causes: 'Causal relationship (X causes Y)',
  requires: 'Dependency relationship (X requires Y)',
  depends_on: 'Technical dependency (X depends on Y)',
  authored_by: 'Authorship (X was created/authored by Y)',
  affiliated_with: 'Association (X is affiliated with Y)',
  located_in: 'Location (X is located in Y)',
  occurred_at: 'Temporal location (X occurred at Y)',
  compares_to: 'Comparison (X is similar to Y)',
  contrasts_with: 'Contrast (X is different from Y)',
};

// Rule-based patterns for relation extraction
interface RelationPattern {
  pattern: RegExp;
  type: RelationType;
  sourceGroup: number;
  targetGroup: number;
  confidence: number;
}

const RELATION_PATTERNS: RelationPattern[] = [
  // is_a patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+is\s+a\s+(?:type\s+of\s+)?([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'is_a',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.7,
  },
  {
    pattern: /([가-힣A-Za-z0-9]+)(?:은|는|이|가)\s+([가-힣A-Za-z0-9]+)의?\s*(?:일종|종류)/g,
    type: 'is_a',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.7,
  },
  // part_of patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+is\s+part\s+of\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'part_of',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.8,
  },
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+includes?\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'part_of',
    sourceGroup: 2,
    targetGroup: 1,
    confidence: 0.6,
  },
  // belongs_to patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+belongs?\s+to\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'belongs_to',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.8,
  },
  // authored_by patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+(?:was\s+)?(?:created|authored|written|developed)\s+by\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'authored_by',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.8,
  },
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+(?:created|authored|wrote|developed)\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'authored_by',
    sourceGroup: 2,
    targetGroup: 1,
    confidence: 0.7,
  },
  // affiliated_with patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+(?:works?\s+(?:at|for)|is\s+(?:at|with))\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'affiliated_with',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.7,
  },
  // located_in patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+(?:is\s+)?(?:located|based|headquartered)\s+in\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'located_in',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.8,
  },
  // depends_on patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+(?:depends|relies)\s+on\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'depends_on',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.8,
  },
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+uses?\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'depends_on',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.5,
  },
  // requires patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+requires?\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'requires',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.8,
  },
  // compares_to patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+(?:is\s+)?similar\s+to\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'compares_to',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.7,
  },
  // contrasts_with patterns
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+(?:is\s+)?different\s+from\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'contrasts_with',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.7,
  },
  {
    pattern: /([A-Za-z][A-Za-z0-9\s]+)\s+(?:vs\.?|versus)\s+([A-Za-z][A-Za-z0-9\s]+)/gi,
    type: 'contrasts_with',
    sourceGroup: 1,
    targetGroup: 2,
    confidence: 0.6,
  },
];

// ============================================
// LLM Prompt
// ============================================

const RELATION_EXTRACTION_PROMPT = `You are an expert relation extractor. Given a text and a list of entities, extract relationships between them.

## Relation Types
${Object.entries(RELATION_DESCRIPTIONS).map(([type, desc]) => `- ${type}: ${desc}`).join('\n')}

## Output Format
Return a JSON array of relations. Each relation must have:
- source: The name of the source entity (must match exactly from entity list)
- target: The name of the target entity (must match exactly from entity list)
- type: One of the relation types above
- evidence: The exact text that supports this relation (quote from input)
- confidence: How certain you are (0.0-1.0)

## Rules
1. Only extract relations between entities in the provided list
2. Each relation must have clear textual evidence
3. Be conservative - only extract if the relation is explicit or strongly implied
4. Avoid extracting transitive or inferred relations
5. Set confidence based on how explicit the relation is

Return only valid JSON array. No markdown, no explanation.
Example: [{"source": "OpenAI", "target": "GPT-4", "type": "authored_by", "evidence": "OpenAI released GPT-4", "confidence": 0.9}]

If no relations found, return empty array: []`;

// ============================================
// Rule-based Extraction
// ============================================

interface RuleRelationMatch {
  source: string;
  target: string;
  type: RelationType;
  evidence: string;
  confidence: number;
}

function extractRelationsByRules(
  text: string,
  entities: EntityInput[]
): RuleRelationMatch[] {
  const matches: RuleRelationMatch[] = [];
  const seen = new Set<string>();

  // Build entity name lookup
  const entityNames = new Set<string>();
  for (const entity of entities) {
    entityNames.add(entity.name.toLowerCase());
    for (const alias of entity.aliases || []) {
      entityNames.add(alias.toLowerCase());
    }
  }

  // Helper to find matching entity
  const findEntity = (name: string): string | null => {
    const normalized = name.toLowerCase().trim();
    if (entityNames.has(normalized)) {
      // Find the canonical name
      for (const entity of entities) {
        if (entity.name.toLowerCase() === normalized) {
          return entity.name;
        }
        for (const alias of entity.aliases || []) {
          if (alias.toLowerCase() === normalized) {
            return entity.name;
          }
        }
      }
    }
    return null;
  };

  for (const pattern of RELATION_PATTERNS) {
    // Reset regex state
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(text)) !== null) {
      const sourceName = match[pattern.sourceGroup]?.trim();
      const targetName = match[pattern.targetGroup]?.trim();

      if (!sourceName || !targetName) continue;

      // Check if both are known entities
      const source = findEntity(sourceName);
      const target = findEntity(targetName);

      if (!source || !target || source === target) continue;

      const key = `${source}:${pattern.type}:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);

      matches.push({
        source,
        target,
        type: pattern.type,
        evidence: match[0],
        confidence: pattern.confidence,
      });
    }
  }

  return matches;
}

// ============================================
// LLM-based Extraction
// ============================================

interface LlmRelation {
  source: string;
  target: string;
  type: RelationType;
  evidence?: string;
  confidence?: number;
}

async function extractRelationsByLlm(
  text: string,
  entities: EntityInput[],
  model: 'haiku' | 'sonnet'
): Promise<LlmRelation[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, skipping LLM relation extraction');
    return [];
  }

  if (entities.length === 0) {
    return [];
  }

  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-3-5-sonnet-20241022';

  // Format entity list
  const entityList = entities
    .map(e => `- ${e.name} (${e.type})`)
    .join('\n');

  // Truncate text if too long
  const maxChars = 6000;
  const truncatedText = text.length > maxChars
    ? text.slice(0, maxChars) + '...[truncated]'
    : text;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 2048,
        system: RELATION_EXTRACTION_PROMPT,
        messages: [
          {
            role: 'user',
            content: `## Entities\n${entityList}\n\n## Text\n${truncatedText}\n\nExtract relations between the entities above.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('LLM relation extraction failed:', await response.text());
      return [];
    }

    const data = await response.json();
    const content = data.content[0]?.text || '[]';

    // Parse JSON response
    const relations = JSON.parse(content);
    if (!Array.isArray(relations)) return [];

    // Validate relations
    const entityNameSet = new Set(entities.map(e => e.name.toLowerCase()));

    return relations
      .filter((r: LlmRelation) => {
        if (!r.source || !r.target || !r.type) return false;
        if (!entityNameSet.has(r.source.toLowerCase())) return false;
        if (!entityNameSet.has(r.target.toLowerCase())) return false;
        if (!Object.keys(RELATION_DESCRIPTIONS).includes(r.type)) return false;
        return true;
      })
      .map((r: LlmRelation) => ({
        source: r.source,
        target: r.target,
        type: r.type,
        evidence: r.evidence,
        confidence: Math.min(1, Math.max(0, r.confidence || 0.8)),
      }));
  } catch (error) {
    console.error('LLM relation extraction error:', error);
    return [];
  }
}

// ============================================
// Merge and Deduplicate
// ============================================

function mergeRelations(
  ruleMatches: RuleRelationMatch[],
  llmRelations: LlmRelation[],
  entities: EntityInput[],
  chunkId: string,
  minConfidence: number
): RelationInput[] {
  const relationMap = new Map<string, RelationInput>();

  // Build entity name to ID lookup (temporary IDs based on name)
  const entityIdMap = new Map<string, string>();
  for (const entity of entities) {
    const tempId = `ent_${entity.name.toLowerCase().replace(/\s+/g, '_')}`;
    entityIdMap.set(entity.name.toLowerCase(), tempId);
    for (const alias of entity.aliases || []) {
      entityIdMap.set(alias.toLowerCase(), tempId);
    }
  }

  const getEntityId = (name: string): string | null => {
    return entityIdMap.get(name.toLowerCase()) || null;
  };

  // Process LLM relations first (higher quality)
  for (const relation of llmRelations) {
    if (relation.confidence && relation.confidence < minConfidence) continue;

    const sourceId = getEntityId(relation.source);
    const targetId = getEntityId(relation.target);
    if (!sourceId || !targetId) continue;

    const key = `${sourceId}:${relation.type}:${targetId}`;
    relationMap.set(key, {
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      type: relation.type,
      evidence: relation.evidence,
      evidenceChunkId: chunkId,
      confidence: relation.confidence || 0.8,
      metadata: {},
    });
  }

  // Add rule-based matches that weren't found by LLM
  for (const match of ruleMatches) {
    if (match.confidence < minConfidence) continue;

    const sourceId = getEntityId(match.source);
    const targetId = getEntityId(match.target);
    if (!sourceId || !targetId) continue;

    const key = `${sourceId}:${match.type}:${targetId}`;
    if (!relationMap.has(key)) {
      relationMap.set(key, {
        sourceEntityId: sourceId,
        targetEntityId: targetId,
        type: match.type,
        evidence: match.evidence,
        evidenceChunkId: chunkId,
        confidence: match.confidence,
        metadata: { source: 'rule' },
      });
    } else {
      // Boost confidence if both methods found the relation
      const existing = relationMap.get(key)!;
      existing.confidence = Math.min(1, (existing.confidence ?? 0.8) + 0.1);
    }
  }

  return Array.from(relationMap.values());
}

// ============================================
// Main Export
// ============================================

export interface RelationExtractionResult {
  relations: RelationInput[];
  processingTimeMs: number;
}

/**
 * Extract relations from text chunks given extracted entities
 */
export async function extractRelations(
  chunks: ChunkInput[],
  entities: EntityInput[],
  options: ExtractionOptions = {}
): Promise<RelationExtractionResult> {
  const startTime = Date.now();

  const {
    useLlm = true,
    useRules = true,
    model = 'haiku',
    minConfidence = 0.5,
  } = options;

  const allRelations: RelationInput[] = [];

  for (const chunk of chunks) {
    // Get entities for this chunk
    const chunkEntities = entities.filter(e => e.sourceChunkId === chunk.id);
    if (chunkEntities.length < 2) continue; // Need at least 2 entities for relations

    // Rule-based extraction
    const ruleMatches = useRules
      ? extractRelationsByRules(chunk.content, chunkEntities)
      : [];

    // LLM-based extraction
    const llmRelations = useLlm
      ? await extractRelationsByLlm(chunk.content, chunkEntities, model)
      : [];

    // Merge and deduplicate
    const merged = mergeRelations(
      ruleMatches,
      llmRelations,
      chunkEntities,
      chunk.id,
      minConfidence
    );

    allRelations.push(...merged);
  }

  return {
    relations: allRelations,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Extract relations from a single text string
 */
export async function extractRelationsFromText(
  text: string,
  chunkId: string,
  entities: EntityInput[],
  options: ExtractionOptions = {}
): Promise<RelationExtractionResult> {
  return extractRelations(
    [{ id: chunkId, content: text }],
    entities,
    options
  );
}
