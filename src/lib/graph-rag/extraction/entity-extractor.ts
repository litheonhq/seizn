import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
import { logServerError, logServerWarn } from '@/lib/server/logger';
/**
 * Entity Extractor
 *
 * Extracts entities from text chunks using a combination of:
 * 1. Rule-based NER (dates, organizations, technology patterns)
 * 2. LLM-based extraction (Claude Haiku/Sonnet)
 */

import type {
  EntityInput,
  EntityType,
  ChunkInput,
  ExtractionOptions,
} from '../types';

// ============================================
// Constants
// ============================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Rule-based patterns for entity extraction
const PATTERNS: Record<EntityType, RegExp[]> = {
  person: [
    // Names with titles
    /(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g,
    // Korean names (2-4 syllables)
    /([\p{Script=Hangul}]{2,4})(?:\s*[\p{Script=Hangul}]{1,6})?/gu,
  ],
  organization: [
    // Company suffixes
    /([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)\s+(?:Inc\.|Corp\.|Ltd\.|LLC|Co\.|Company|Corporation)/gi,
    // Korean company names
    /(?:주식회사|회사)\s*([\p{Script=Hangul}A-Za-z0-9]+)/gu,
    /([\p{Script=Hangul}A-Za-z0-9]+)\s*(?:주식회사|회사)/gu,
    // Universities
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:University|College|Institute)/gi,
    /([\p{Script=Hangul}]+)\s*(?:대학교|대학|연구소|연구원)/gu,
  ],
  location: [
    // Cities/Countries with context
    /(?:in|at|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    // Korean locations
    /([\p{Script=Hangul}]+(?:시|군|구|동|면|리))/gu,
    // Addresses
    /\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Boulevard|Blvd\.)/gi,
  ],
  technology: [
    // Programming languages and frameworks
    /\b(React|Vue|Angular|Node\.js|Python|Java|TypeScript|JavaScript|Go|Rust|Ruby|Swift|Kotlin)\b/g,
    // Databases
    /\b(PostgreSQL|MySQL|MongoDB|Redis|Elasticsearch|Supabase|Firebase|DynamoDB)\b/g,
    // Cloud services
    /\b(AWS|Azure|GCP|Google Cloud|Vercel|Netlify|Heroku)\b/g,
    // AI/ML
    /\b(GPT-\d+|Claude|Gemini|LLaMA|BERT|Transformer|CNN|RNN|LSTM)\b/g,
    // Protocols and standards
    /\b(REST|GraphQL|gRPC|WebSocket|OAuth|JWT|HTTPS?|TCP|UDP)\b/g,
  ],
  method: [
    // Methodologies
    /\b(Agile|Scrum|Kanban|DevOps|CI\/CD|TDD|BDD|DDD)\b/gi,
    // Algorithms
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:algorithm|method|approach|technique)/gi,
  ],
  concept: [
    // Technical concepts
    /\b(machine learning|deep learning|artificial intelligence|neural network|natural language processing|computer vision)\b/gi,
    // Business concepts
    /\b(ROI|KPI|OKR|SaaS|PaaS|IaaS|B2B|B2C|MVP)\b/g,
  ],
  event: [
    // Dates
    /\b(\d{4}[-/]\d{2}[-/]\d{2})\b/g,
    // Named events
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Conference|Summit|Workshop|Hackathon|Event)\b/g,
    // Version releases
    /\b(v?\d+\.\d+(?:\.\d+)?)\s+(?:release|launch|update)\b/gi,
  ],
  product: [
    // Product names with versions
    /\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)\s+(?:Pro|Plus|Premium|Enterprise|Free|Lite)\b/g,
    // API/SDK names
    /\b([A-Z][A-Za-z0-9]+)\s+(?:API|SDK|Framework|Library)\b/g,
  ],
  document: [
    // Document references
    /\b(?:RFC|ISO|IEEE)\s*(\d+)/gi,
    // Paper/Article references
    /"([^"]+)"\s+(?:paper|article|study|report)/gi,
  ],
  custom: [],
};

// ============================================
// LLM Prompt
// ============================================

const ENTITY_EXTRACTION_PROMPT = `You are an expert entity extractor. Extract named entities from the provided text.

## Entity Types
- person: People's names (individuals)
- organization: Companies, institutions, teams
- location: Cities, countries, addresses, places
- concept: Abstract ideas, theories, frameworks
- technology: Programming languages, tools, platforms, libraries
- method: Methodologies, algorithms, processes
- event: Conferences, releases, milestones with dates
- product: Software products, services, APIs
- document: Papers, standards, specifications

## Output Format
Return a JSON array of entities. Each entity must have:
- name: The canonical name of the entity
- type: One of the entity types above
- aliases: Array of alternative names/abbreviations (can be empty)
- description: Brief description (1 sentence, optional)
- confidence: How certain you are (0.0-1.0)

## Rules
1. Extract only clearly identifiable entities
2. Normalize names to their canonical form
3. Include common aliases and abbreviations
4. Set confidence based on context clarity
5. Avoid extracting generic terms
6. Do not extract partial or unclear mentions
7. For technology, be specific (e.g., "React" not "JavaScript framework")

Return only valid JSON array. No markdown, no explanation.
Example: [{"name": "OpenAI", "type": "organization", "aliases": ["Open AI"], "description": "AI research company", "confidence": 0.95}]

If no entities found, return empty array: []`;

// ============================================
// Rule-based Extraction
// ============================================

interface RuleMatch {
  name: string;
  type: EntityType;
  confidence: number;
}

function extractByRules(text: string, entityTypes: EntityType[]): RuleMatch[] {
  const matches: RuleMatch[] = [];
  const seen = new Set<string>();

  for (const type of entityTypes) {
    const patterns = PATTERNS[type];
    if (!patterns) continue;

    for (const pattern of patterns) {
      // Reset regex state
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]?.trim();
        if (!name || name.length < 2 || name.length > 100) continue;

        const key = `${type}:${name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        matches.push({
          name,
          type,
          confidence: 0.7, // Rule-based matches have moderate confidence
        });
      }
    }
  }

  return matches;
}

// ============================================
// LLM-based Extraction
// ============================================

interface LlmEntity {
  name: string;
  type: EntityType;
  aliases?: string[];
  description?: string;
  confidence?: number;
}

async function extractByLlm(
  text: string,
  model: 'haiku' | 'sonnet'
): Promise<LlmEntity[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logServerWarn('ANTHROPIC_API_KEY not set, skipping LLM extraction');
    return [];
  }

  const modelId = model === 'haiku'
    ? 'claude-3-5-haiku-20241022'
    : 'claude-3-5-sonnet-20241022';

  // Truncate text if too long
  const maxChars = 8000;
  const truncatedText = text.length > maxChars
    ? text.slice(0, maxChars) + '...[truncated]'
    : text;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: buildAnthropicHeaders(apiKey),
      body: JSON.stringify({
        model: modelId,
        max_tokens: 2048,
        system: ENTITY_EXTRACTION_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract entities from this text:\n\n${truncatedText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      logServerError('LLM extraction failed', await response.text());
      return [];
    }

    const data = await response.json();
    const content = data.content[0]?.text || '[]';

    // Parse JSON response
    const entities = JSON.parse(content);
    if (!Array.isArray(entities)) return [];

    return entities.map((e: LlmEntity) => ({
      name: e.name,
      type: e.type || 'custom',
      aliases: Array.isArray(e.aliases) ? e.aliases : [],
      description: e.description,
      confidence: Math.min(1, Math.max(0, e.confidence || 0.8)),
    }));
  } catch (error) {
    logServerError('LLM extraction error', error);
    return [];
  }
}

// ============================================
// Merge and Deduplicate
// ============================================

function mergeEntities(
  ruleMatches: RuleMatch[],
  llmEntities: LlmEntity[],
  minConfidence: number
): EntityInput[] {
  const entityMap = new Map<string, EntityInput>();

  // Process LLM entities first (higher quality)
  for (const entity of llmEntities) {
    if (entity.confidence && entity.confidence < minConfidence) continue;

    const key = `${entity.type}:${entity.name.toLowerCase()}`;
    entityMap.set(key, {
      name: entity.name,
      type: entity.type,
      aliases: entity.aliases || [],
      description: entity.description,
      confidence: entity.confidence || 0.8,
      sourceChunkId: '', // Will be set by caller
      metadata: {},
    });

    // Also map aliases
    for (const alias of entity.aliases || []) {
      const aliasKey = `${entity.type}:${alias.toLowerCase()}`;
      if (!entityMap.has(aliasKey)) {
        entityMap.set(aliasKey, entityMap.get(key)!);
      }
    }
  }

  // Add rule-based matches that weren't found by LLM
  for (const match of ruleMatches) {
    if (match.confidence < minConfidence) continue;

    const key = `${match.type}:${match.name.toLowerCase()}`;
    if (!entityMap.has(key)) {
      entityMap.set(key, {
        name: match.name,
        type: match.type,
        aliases: [],
        confidence: match.confidence,
        sourceChunkId: '', // Will be set by caller
        metadata: { source: 'rule' },
      });
    } else {
      // Boost confidence if both methods found the entity
      const existing = entityMap.get(key)!;
      existing.confidence = Math.min(1, (existing.confidence ?? 0.8) + 0.1);
    }
  }

  // Deduplicate by keeping unique entities
  const seen = new Set<string>();
  const result: EntityInput[] = [];

  for (const entity of entityMap.values()) {
    const key = `${entity.type}:${entity.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entity);
  }

  return result;
}

// ============================================
// Main Export
// ============================================

export interface EntityExtractionResult {
  entities: EntityInput[];
  processingTimeMs: number;
}

/**
 * Extract entities from text chunks
 */
export async function extractEntities(
  chunks: ChunkInput[],
  options: ExtractionOptions = {}
): Promise<EntityExtractionResult> {
  const startTime = Date.now();

  const {
    useLlm = true,
    useRules = true,
    model = 'haiku',
    entityTypes = ['person', 'organization', 'location', 'concept', 'technology', 'method', 'event', 'product', 'document'],
    minConfidence = 0.5,
    maxEntitiesPerChunk = 50,
  } = options;

  const allEntities: EntityInput[] = [];

  for (const chunk of chunks) {
    const chunkEntities: EntityInput[] = [];

    // Rule-based extraction
    const ruleMatches = useRules
      ? extractByRules(chunk.content, entityTypes)
      : [];

    // LLM-based extraction
    const llmEntities = useLlm
      ? await extractByLlm(chunk.content, model)
      : [];

    // Merge and deduplicate
    const merged = mergeEntities(ruleMatches, llmEntities, minConfidence);

    // Limit per chunk and set source
    for (const entity of merged.slice(0, maxEntitiesPerChunk)) {
      chunkEntities.push({
        ...entity,
        sourceChunkId: chunk.id,
        metadata: {
          ...entity.metadata,
          ...(chunk.metadata || {}),
        },
      });
    }

    allEntities.push(...chunkEntities);
  }

  return {
    entities: allEntities,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Extract entities from a single text string
 */
export async function extractEntitiesFromText(
  text: string,
  chunkId: string,
  options: ExtractionOptions = {}
): Promise<EntityExtractionResult> {
  return extractEntities([{ id: chunkId, content: text }], options);
}
