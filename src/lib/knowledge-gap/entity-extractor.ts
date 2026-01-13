/**
 * Entity Extractor for Knowledge Gap Detection
 *
 * Extracts entities from queries and identifies which ones
 * are missing from the knowledge corpus.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MissingEntity, EntityType } from './types';

// =============================================================================
// Configuration
// =============================================================================

const ENTITY_EXTRACTION_PROMPT = `You are an entity extraction system. Your task is to identify named entities in the given query text.

Extract entities in these categories:
- person: Names of people
- organization: Companies, institutions, teams
- product: Product names, brand names, services
- project: Project names, initiative names
- date: Specific dates, time periods
- location: Places, addresses, regions
- event: Events, conferences, meetings
- concept: Technical terms, methodologies, frameworks
- other: Any other proper nouns

For each entity, provide:
1. The exact name as it appears in the text
2. The entity type
3. Your confidence (0.0 to 1.0)
4. The surrounding context (a few words around the entity)

Return JSON in this format:
{
  "entities": [
    {
      "name": "entity name",
      "type": "person|organization|product|project|date|location|event|concept|other",
      "confidence": 0.85,
      "context": "surrounding text context"
    }
  ]
}

Only extract proper nouns and specific named entities. Do not extract common nouns or general concepts.
If no entities are found, return {"entities": []}`;

// =============================================================================
// Pattern-based Entity Extraction (fallback/supplement)
// =============================================================================

interface EntityPattern {
  type: EntityType;
  patterns: RegExp[];
}

const ENTITY_PATTERNS: EntityPattern[] = [
  {
    type: 'date',
    patterns: [
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(,?\s+\d{4})?\b/gi,
      /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
      /\b(Q[1-4])\s*(\d{4})?\b/gi,
      /\b(FY|H[12])\s*\d{2,4}\b/gi,
      /\b(20[0-9]{2})\b/g,
    ],
  },
  {
    type: 'organization',
    patterns: [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Inc|Corp|LLC|Ltd|GmbH|Co|Company|Corporation|Foundation|Institute|University|College)\b/g,
      /\b(Google|Apple|Microsoft|Amazon|Meta|Facebook|Netflix|Tesla|OpenAI|Anthropic|Salesforce|Oracle|IBM|Intel|Nvidia|Adobe|SAP|Cisco)\b/gi,
    ],
  },
  {
    type: 'product',
    patterns: [
      /\b(iPhone|iPad|MacBook|iMac|Apple Watch|AirPods)\s*\d*\s*(Pro|Max|Plus|Mini|SE|Ultra)?\b/gi,
      /\b(Windows|macOS|iOS|Android|Linux|Ubuntu)\s*\d*\.?\d*\b/gi,
      /\b(ChatGPT|GPT-[34]|Claude|Gemini|LLaMA|Mistral|DALL-E|Midjourney)\b/gi,
      /\b(AWS|Azure|GCP|Google Cloud)\b/gi,
      /\b(React|Vue|Angular|Next\.?js|Node\.?js|Django|FastAPI|Spring)\b/gi,
    ],
  },
  {
    type: 'location',
    patterns: [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+(CA|NY|TX|FL|WA|MA|IL|PA|OH|GA|NC|MI|NJ|VA|AZ)\b/g,
      /\b(New York|Los Angeles|San Francisco|Chicago|Boston|Seattle|Miami|Austin|Denver|Atlanta|London|Paris|Tokyo|Berlin|Singapore|Sydney|Toronto)\b/gi,
      /\b(USA|UK|EU|APAC|EMEA|LATAM)\b/g,
    ],
  },
  {
    type: 'event',
    patterns: [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Conference|Summit|Expo|Convention|Symposium|Workshop|Meetup)\b/gi,
      /\b(WWDC|Google I\/O|AWS re:Invent|Build|Connect|Ignite|KubeCon|PyCon|JSConf)\b/gi,
    ],
  },
  {
    type: 'concept',
    patterns: [
      /\b(RAG|LLM|NLP|ML|AI|API|REST|GraphQL|gRPC|OAuth|JWT|SSO|SAML|RBAC|ABAC)\b/g,
      /\b(Kubernetes|Docker|Terraform|Ansible|Jenkins|GitLab|GitHub Actions)\b/gi,
      /\b(PostgreSQL|MongoDB|Redis|Elasticsearch|Kafka|RabbitMQ|Supabase)\b/gi,
    ],
  },
];

/**
 * Extract entities using regex patterns
 */
function extractEntitiesWithPatterns(query: string): MissingEntity[] {
  const entities: MissingEntity[] = [];
  const seen = new Set<string>();

  for (const { type, patterns } of ENTITY_PATTERNS) {
    for (const pattern of patterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(query)) !== null) {
        const name = match[0].trim();
        const key = `${name.toLowerCase()}-${type}`;

        if (!seen.has(key)) {
          seen.add(key);

          // Extract context (surrounding text)
          const startIdx = Math.max(0, match.index - 20);
          const endIdx = Math.min(query.length, match.index + name.length + 20);
          const context = query.slice(startIdx, endIdx).trim();

          entities.push({
            name,
            type,
            confidence: 0.8, // High confidence for pattern matches
            context,
          });
        }
      }
    }
  }

  return entities;
}

/**
 * Extract capitalized multi-word phrases as potential entities
 */
function extractCapitalizedPhrases(query: string): MissingEntity[] {
  const entities: MissingEntity[] = [];
  const seen = new Set<string>();

  // Match sequences of capitalized words (proper nouns)
  const phrasePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match;

  while ((match = phrasePattern.exec(query)) !== null) {
    const name = match[0].trim();
    const key = name.toLowerCase();

    if (!seen.has(key) && !isCommonPhrase(name)) {
      seen.add(key);

      const startIdx = Math.max(0, match.index - 15);
      const endIdx = Math.min(query.length, match.index + name.length + 15);
      const context = query.slice(startIdx, endIdx).trim();

      entities.push({
        name,
        type: guessEntityType(name),
        confidence: 0.6, // Lower confidence for generic pattern
        context,
      });
    }
  }

  // Also match single capitalized words that are likely entities
  const singlePattern = /\b([A-Z][a-z]{2,})\b/g;

  while ((match = singlePattern.exec(query)) !== null) {
    const name = match[0].trim();
    const key = name.toLowerCase();

    if (!seen.has(key) && !isCommonWord(name) && !isCommonPhrase(name)) {
      seen.add(key);

      const startIdx = Math.max(0, match.index - 15);
      const endIdx = Math.min(query.length, match.index + name.length + 15);
      const context = query.slice(startIdx, endIdx).trim();

      entities.push({
        name,
        type: 'other',
        confidence: 0.4, // Lower confidence for single words
        context,
      });
    }
  }

  return entities;
}

/**
 * Guess entity type based on context clues
 */
function guessEntityType(name: string): EntityType {
  const nameLower = name.toLowerCase();

  if (/\b(inc|corp|llc|ltd|company|foundation|institute)\b/i.test(name)) {
    return 'organization';
  }
  if (/\b(project|initiative|program)\b/i.test(nameLower)) {
    return 'project';
  }
  if (/\b(conference|summit|expo|workshop)\b/i.test(nameLower)) {
    return 'event';
  }
  if (/\b(city|street|avenue|building)\b/i.test(nameLower)) {
    return 'location';
  }

  return 'other';
}

/**
 * Check if a phrase is a common phrase (not an entity)
 */
function isCommonPhrase(phrase: string): boolean {
  const commonPhrases = new Set([
    'The', 'This', 'That', 'These', 'Those',
    'What', 'Which', 'Where', 'When', 'Why', 'How',
    'Please', 'Thank', 'Thanks',
    'Hello', 'Hi', 'Hey',
    'Good', 'Great', 'Best', 'Better',
    'New', 'Old', 'First', 'Last', 'Next',
    'Some', 'Any', 'All', 'Each', 'Every',
    'More', 'Most', 'Less', 'Least',
    'Very', 'Really', 'Just', 'Only',
  ]);

  // Check first word
  const firstWord = phrase.split(' ')[0];
  return commonPhrases.has(firstWord);
}

/**
 * Check if a word is a common word
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'the', 'this', 'that', 'these', 'those',
    'what', 'which', 'who', 'where', 'when', 'why', 'how',
    'can', 'could', 'would', 'should', 'will', 'may', 'might',
    'have', 'has', 'had', 'been', 'being',
    'are', 'was', 'were', 'is', 'am',
    'not', 'but', 'and', 'or', 'if', 'then',
    'for', 'from', 'with', 'into', 'about',
    'also', 'just', 'only', 'even', 'still',
    'more', 'most', 'less', 'much', 'many',
    'all', 'each', 'every', 'both',
    'one', 'two', 'first', 'second', 'last',
    'new', 'old', 'good', 'great', 'small', 'large',
    'please', 'thank', 'thanks', 'hello', 'yes', 'no',
    'get', 'find', 'show', 'tell', 'give', 'make',
    'need', 'want', 'like', 'help', 'know', 'think',
    'use', 'using', 'used', 'way', 'ways',
  ]);

  return commonWords.has(word.toLowerCase());
}

// =============================================================================
// LLM-based Entity Extraction
// =============================================================================

/**
 * Extract entities using Claude LLM
 */
async function extractEntitiesWithLLM(query: string): Promise<MissingEntity[]> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('ANTHROPIC_API_KEY not set, falling back to pattern extraction');
      return [];
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${ENTITY_EXTRACTION_PROMPT}\n\nQuery: "${query}"`,
        },
      ],
    });

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return [];
    }

    // Parse JSON response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.entities || !Array.isArray(parsed.entities)) {
      return [];
    }

    return parsed.entities.map((e: Record<string, unknown>) => ({
      name: String(e.name || ''),
      type: (e.type as EntityType) || 'other',
      confidence: Number(e.confidence) || 0.5,
      context: String(e.context || ''),
    }));
  } catch (error) {
    console.error('LLM entity extraction failed:', error);
    return [];
  }
}

// =============================================================================
// Main Export Function
// =============================================================================

/**
 * Extract entities from a query that are missing from the corpus
 *
 * @param query - The user's query text
 * @param existingEntities - Entities already present in the corpus (lowercase)
 * @param minConfidence - Minimum confidence threshold for entities
 * @returns Array of missing entities
 */
export async function extractMissingEntities(
  query: string,
  existingEntities: string[],
  minConfidence: number = 0.6
): Promise<MissingEntity[]> {
  // Normalize existing entities for comparison
  const existingSet = new Set(existingEntities.map((e) => e.toLowerCase()));

  // Combine pattern-based and heuristic extraction
  const patternEntities = extractEntitiesWithPatterns(query);
  const phraseEntities = extractCapitalizedPhrases(query);

  // Try LLM extraction for more nuanced entities
  let llmEntities: MissingEntity[] = [];
  try {
    llmEntities = await extractEntitiesWithLLM(query);
  } catch {
    // Fallback to pattern-only if LLM fails
    console.warn('LLM extraction failed, using pattern-based only');
  }

  // Merge all entities, preferring LLM results for duplicates
  const entityMap = new Map<string, MissingEntity>();

  // Add pattern entities first (lower priority)
  for (const entity of phraseEntities) {
    const key = entity.name.toLowerCase();
    if (!entityMap.has(key)) {
      entityMap.set(key, entity);
    }
  }

  for (const entity of patternEntities) {
    const key = entity.name.toLowerCase();
    const existing = entityMap.get(key);
    if (!existing || existing.confidence < entity.confidence) {
      entityMap.set(key, entity);
    }
  }

  // Add LLM entities (higher priority)
  for (const entity of llmEntities) {
    const key = entity.name.toLowerCase();
    const existing = entityMap.get(key);
    if (!existing || existing.confidence < entity.confidence) {
      entityMap.set(key, entity);
    }
  }

  // Filter to missing entities above confidence threshold
  const missingEntities: MissingEntity[] = [];

  for (const entity of entityMap.values()) {
    const key = entity.name.toLowerCase();

    // Skip if entity exists in corpus
    if (existingSet.has(key)) continue;

    // Skip if below confidence threshold
    if (entity.confidence < minConfidence) continue;

    // Check for partial matches (entity might be part of a longer name)
    let foundPartial = false;
    for (const existing of existingSet) {
      if (existing.includes(key) || key.includes(existing)) {
        foundPartial = true;
        break;
      }
    }
    if (foundPartial) continue;

    missingEntities.push(entity);
  }

  // Sort by confidence descending
  return missingEntities.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Extract all entities from a query (not filtering by existing)
 */
export async function extractAllEntities(query: string): Promise<MissingEntity[]> {
  return extractMissingEntities(query, [], 0.3);
}
