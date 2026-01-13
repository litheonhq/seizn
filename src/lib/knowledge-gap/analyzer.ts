/**
 * Knowledge Gap Analyzer
 *
 * Analyzes failed queries to identify the type of knowledge gap
 * and provide actionable insights for filling the gap.
 */

import type {
  GapAnalysis,
  GapAnalysisInput,
  GapType,
  MissingEntity,
  SuggestedSource,
  RelatedDoc,
  KnowledgeGapConfig,
} from './types';
import { DEFAULT_GAP_CONFIG } from './types';
import { extractMissingEntities } from './entity-extractor';
import { suggestSources } from './source-suggester';

// =============================================================================
// Gap Type Detection Rules
// =============================================================================

interface GapSignals {
  noResults: boolean;
  lowSimilarity: boolean;
  permissionFiltered: boolean;
  temporalQuery: boolean;
  tabularQuery: boolean;
  domainMismatch: boolean;
  partialCoverage: boolean;
  unknownEntities: MissingEntity[];
}

/**
 * Detect signals that indicate different types of gaps
 */
function detectGapSignals(
  input: GapAnalysisInput,
  config: KnowledgeGapConfig
): GapSignals {
  const { query, retrievalResult } = input;
  const queryLower = query.toLowerCase();

  // Basic result analysis
  const noResults = retrievalResult.totalResults === 0;
  const avgSimilarity =
    retrievalResult.results.length > 0
      ? retrievalResult.results.reduce((sum, r) => sum + r.similarity, 0) /
        retrievalResult.results.length
      : 0;
  const lowSimilarity = avgSimilarity < config.minSimilarityThreshold;

  // Permission filtering
  const permissionFiltered = (retrievalResult.filteredByPermission ?? 0) > 0;

  // Temporal indicators
  const temporalPatterns = [
    /\b(latest|recent|new|current|today|yesterday|this (week|month|year))\b/i,
    /\b(202[4-9]|2030|203[0-9])\b/, // Future/recent years
    /\b(updated?|changed?|modified)\s+(in|on|since)\b/i,
    /what('?s| is) (new|happening)/i,
  ];
  const temporalQuery = temporalPatterns.some((p) => p.test(query));

  // Tabular data indicators
  const tabularPatterns = [
    /\b(table|spreadsheet|csv|excel|data\s*sheet)\b/i,
    /\b(compare|comparison|vs\.?|versus)\b/i,
    /\b(list|enumerate|breakdown)\s+(of|all)\b/i,
    /\b(statistics|stats|metrics|numbers)\b/i,
    /\b(how (many|much))\b/i,
  ];
  const tabularQuery = tabularPatterns.some((p) => p.test(query));

  // Domain mismatch detection (based on retrieved content)
  const queryDomains = extractQueryDomains(query);
  const resultDomains = extractResultDomains(retrievalResult.results);
  const domainMismatch =
    queryDomains.size > 0 &&
    resultDomains.size > 0 &&
    !hasOverlap(queryDomains, resultDomains);

  // Partial coverage detection
  const partialCoverage =
    retrievalResult.results.length > 0 &&
    retrievalResult.results.length < config.minResultsForGap &&
    avgSimilarity > 0.3 &&
    avgSimilarity < config.minSimilarityThreshold;

  return {
    noResults,
    lowSimilarity,
    permissionFiltered,
    temporalQuery,
    tabularQuery,
    domainMismatch,
    partialCoverage,
    unknownEntities: [], // Will be populated by entity extraction
  };
}

/**
 * Extract domain indicators from query
 */
function extractQueryDomains(query: string): Set<string> {
  const domains = new Set<string>();
  const domainPatterns: Record<string, RegExp[]> = {
    legal: [/\b(law|legal|contract|compliance|regulation|statute|court)\b/i],
    medical: [/\b(medical|health|patient|diagnosis|treatment|clinical)\b/i],
    technical: [/\b(technical|engineering|software|code|api|system)\b/i],
    financial: [/\b(financial|finance|revenue|profit|budget|investment)\b/i],
    scientific: [/\b(research|study|experiment|hypothesis|data|analysis)\b/i],
  };

  for (const [domain, patterns] of Object.entries(domainPatterns)) {
    if (patterns.some((p) => p.test(query))) {
      domains.add(domain);
    }
  }

  return domains;
}

/**
 * Extract domain indicators from results
 */
function extractResultDomains(
  results: GapAnalysisInput['retrievalResult']['results']
): Set<string> {
  const domains = new Set<string>();

  for (const result of results) {
    const text = result.text.toLowerCase();
    const metadata = result.metadata || {};

    // Check text content
    if (/\b(law|legal|contract)\b/.test(text)) domains.add('legal');
    if (/\b(medical|health|patient)\b/.test(text)) domains.add('medical');
    if (/\b(technical|software|api)\b/.test(text)) domains.add('technical');
    if (/\b(financial|revenue|profit)\b/.test(text)) domains.add('financial');
    if (/\b(research|study|experiment)\b/.test(text)) domains.add('scientific');

    // Check metadata
    if (metadata.domain) domains.add(String(metadata.domain));
    if (metadata.category) domains.add(String(metadata.category));
  }

  return domains;
}

/**
 * Check if two sets have any overlap
 */
function hasOverlap<T>(set1: Set<T>, set2: Set<T>): boolean {
  for (const item of set1) {
    if (set2.has(item)) return true;
  }
  return false;
}

// =============================================================================
// Gap Type Classification
// =============================================================================

interface TypeScore {
  type: GapType;
  score: number;
  reasoning: string;
}

/**
 * Score each gap type based on signals
 */
function scoreGapTypes(signals: GapSignals): TypeScore[] {
  const scores: TypeScore[] = [];

  // Permission denied - highest confidence if we know results were filtered
  if (signals.permissionFiltered) {
    scores.push({
      type: 'permission_denied',
      score: 0.95,
      reasoning: 'Results were filtered due to access permissions',
    });
  }

  // Missing entity - if we found unknown entities
  if (signals.unknownEntities.length > 0) {
    const avgConfidence =
      signals.unknownEntities.reduce((sum, e) => sum + e.confidence, 0) /
      signals.unknownEntities.length;
    scores.push({
      type: 'missing_entity',
      score: Math.min(0.9, 0.6 + avgConfidence * 0.3),
      reasoning: `Query mentions ${signals.unknownEntities.length} entity(ies) not found in corpus`,
    });
  }

  // Outdated doc - temporal query with low results
  if (signals.temporalQuery && (signals.noResults || signals.lowSimilarity)) {
    scores.push({
      type: 'outdated_doc',
      score: 0.75,
      reasoning: 'Query references recent information that may not be indexed',
    });
  }

  // Missing table - tabular query with no results
  if (signals.tabularQuery && (signals.noResults || signals.lowSimilarity)) {
    scores.push({
      type: 'missing_table',
      score: 0.7,
      reasoning: 'Query requests structured/tabular data not present in corpus',
    });
  }

  // Domain mismatch
  if (signals.domainMismatch) {
    scores.push({
      type: 'domain_mismatch',
      score: 0.8,
      reasoning: 'Query domain differs from the content domain of results',
    });
  }

  // Coverage gap - partial results
  if (signals.partialCoverage) {
    scores.push({
      type: 'coverage_gap',
      score: 0.65,
      reasoning: 'Topic exists in corpus but coverage is insufficient',
    });
  }

  // Default to coverage gap if nothing else fits and we have no/few results
  if (scores.length === 0 && (signals.noResults || signals.lowSimilarity)) {
    scores.push({
      type: 'coverage_gap',
      score: 0.5,
      reasoning: 'Insufficient results for the query topic',
    });
  }

  return scores.sort((a, b) => b.score - a.score);
}

// =============================================================================
// Related Documents Analysis
// =============================================================================

/**
 * Analyze results to find related but incomplete documents
 */
function analyzeRelatedDocs(
  input: GapAnalysisInput,
  queryEntities: MissingEntity[]
): RelatedDoc[] {
  const relatedDocs: RelatedDoc[] = [];

  for (const result of input.retrievalResult.results) {
    // Skip very low similarity results
    if (result.similarity < 0.3) continue;

    const presentAspects: string[] = [];
    const missingAspects: string[] = [];

    // Check which query entities are present/missing in this doc
    for (const entity of queryEntities) {
      const entityLower = entity.name.toLowerCase();
      const textLower = result.text.toLowerCase();

      if (textLower.includes(entityLower)) {
        presentAspects.push(entity.name);
      } else {
        missingAspects.push(entity.name);
      }
    }

    // Only add if there's something present (partial match)
    if (presentAspects.length > 0 && missingAspects.length > 0) {
      relatedDocs.push({
        documentId: result.documentId,
        title: result.metadata?.title as string | undefined,
        similarity: result.similarity,
        presentAspects,
        missingAspects,
      });
    }
  }

  return relatedDocs.slice(0, 5); // Top 5 related docs
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyze a failed query to identify the knowledge gap type
 */
export async function analyzeKnowledgeGap(
  input: GapAnalysisInput,
  config: Partial<KnowledgeGapConfig> = {}
): Promise<GapAnalysis> {
  const fullConfig: KnowledgeGapConfig = {
    ...DEFAULT_GAP_CONFIG,
    ...config,
  };

  // Step 1: Detect gap signals
  const signals = detectGapSignals(input, fullConfig);

  // Step 2: Extract missing entities if enabled
  let missingEntities: MissingEntity[] = [];
  if (fullConfig.entityExtractionEnabled) {
    const existingEntities = extractEntitiesFromResults(
      input.retrievalResult.results
    );
    missingEntities = await extractMissingEntities(
      input.query,
      existingEntities,
      fullConfig.minEntityConfidence
    );
    signals.unknownEntities = missingEntities;
  }

  // Step 3: Score and select gap type
  const typeScores = scoreGapTypes(signals);
  const topType = typeScores[0] || {
    type: 'coverage_gap' as GapType,
    score: 0.3,
    reasoning: 'Unable to determine specific gap type',
  };

  // Step 4: Suggest sources to fill the gap
  let suggestedSources: SuggestedSource[] = [];
  if (fullConfig.autoSuggestSources) {
    suggestedSources = await suggestSources(
      topType.type,
      missingEntities,
      input.query,
      fullConfig
    );
  }

  // Step 5: Find related documents
  const relatedDocs = analyzeRelatedDocs(input, missingEntities);

  // Step 6: Determine if gap should be created
  const shouldCreateGap =
    fullConfig.autoCreateGaps &&
    topType.score >= 0.5 &&
    (signals.noResults ||
      signals.lowSimilarity ||
      missingEntities.length > 0 ||
      signals.permissionFiltered);

  return {
    gapType: topType.type,
    confidence: topType.score,
    missingEntities,
    suggestedSources,
    relatedDocs,
    explanation: topType.reasoning,
    shouldCreateGap,
  };
}

/**
 * Extract known entities from retrieval results
 */
function extractEntitiesFromResults(
  results: GapAnalysisInput['retrievalResult']['results']
): string[] {
  const entities = new Set<string>();

  for (const result of results) {
    // Extract from metadata
    const metadata = result.metadata || {};
    if (metadata.entities && Array.isArray(metadata.entities)) {
      for (const entity of metadata.entities) {
        if (typeof entity === 'string') {
          entities.add(entity.toLowerCase());
        } else if (entity.name) {
          entities.add(String(entity.name).toLowerCase());
        }
      }
    }

    // Extract capitalized words as potential entities (simple heuristic)
    const words = result.text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (words) {
      for (const word of words) {
        if (word.length > 2 && !isCommonWord(word)) {
          entities.add(word.toLowerCase());
        }
      }
    }
  }

  return Array.from(entities);
}

/**
 * Check if a word is a common word (not an entity)
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'the', 'this', 'that', 'these', 'those',
    'what', 'which', 'who', 'where', 'when', 'why', 'how',
    'can', 'could', 'would', 'should', 'will', 'may', 'might',
    'have', 'has', 'had', 'been', 'being',
    'are', 'was', 'were', 'is', 'am',
    'their', 'there', 'they', 'them',
    'your', 'you', 'our', 'we', 'us',
    'his', 'her', 'him', 'she', 'he', 'it', 'its',
    'not', 'but', 'and', 'or', 'if', 'then', 'else',
    'for', 'from', 'with', 'into', 'onto', 'upon',
    'about', 'above', 'below', 'between', 'among',
    'through', 'during', 'before', 'after', 'since', 'until',
    'while', 'because', 'although', 'however', 'therefore',
    'also', 'just', 'only', 'even', 'still', 'yet',
    'more', 'most', 'less', 'least', 'much', 'many', 'some', 'any',
    'all', 'each', 'every', 'both', 'neither', 'either',
    'one', 'two', 'three', 'first', 'second', 'third', 'last',
    'new', 'old', 'good', 'bad', 'great', 'small', 'large', 'big',
  ]);

  return commonWords.has(word.toLowerCase());
}

/**
 * Check if a query failed retrieval and needs gap analysis
 */
export function shouldAnalyzeForGaps(
  resultsCount: number,
  avgSimilarity: number,
  config: Partial<KnowledgeGapConfig> = {}
): boolean {
  const fullConfig = { ...DEFAULT_GAP_CONFIG, ...config };

  return (
    resultsCount < fullConfig.minResultsForGap ||
    avgSimilarity < fullConfig.minSimilarityThreshold
  );
}

// Re-export config for convenience
export { DEFAULT_GAP_CONFIG } from './types';
