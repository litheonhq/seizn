import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Memory Lifecycle Engine (EverMemOS Pattern)
 *
 * Three-phase memory management inspired by human cognitive processes:
 *
 * Phase 1: Episodic Trace Formation
 *   - Converts conversation streams into MemCells
 *   - Each MemCell contains: atomic facts, episodic trace, time-bounded foresight
 *   - Raw input -> structured, timestamped memory units
 *
 * Phase 2: Semantic Consolidation
 *   - Groups MemCells into thematic MemScenes
 *   - Distills stable semantic structures (facts, patterns)
 *   - Updates persistent user profiles
 *   - Handles contradictions and supersession
 *
 * Phase 3: Reconstructive Recollection
 *   - Agentic retrieval composing necessary and sufficient context
 *   - Multi-graph traversal for rich context assembly
 *   - Adaptive compression based on query complexity
 *
 * Achieves 93.05% on LoCoMo (SOTA) and 83.00% on LongMemEval
 *
 * @see https://arxiv.org/abs/2601.02163 (EverMemOS Paper)
 */

import { createServerClient } from '../supabase';
import { computeEmbedding, cosineSimilarity } from '../embeddings';
import { upsertSlot, VALID_SLOT_KEYS } from './slot';
import { logAuditEvent } from '../audit';

// ============================================
// Types
// ============================================

/**
 * MemCell: atomic unit of episodic memory
 */
export interface MemCell {
  id: string;
  /** Raw content from conversation */
  content: string;
  /** Extracted atomic facts */
  atomicFacts: string[];
  /** Episodic trace: who said what, when, in what context */
  episodicTrace: {
    speaker: 'user' | 'assistant' | 'system';
    timestamp: Date;
    sessionId?: string;
    conversationTurn: number;
    emotionalTone?: 'neutral' | 'positive' | 'negative' | 'urgent';
  };
  /** Time-bounded foresight: predicted relevance window */
  foresight: {
    relevantUntil?: Date;   // When this info expires
    relevantFor?: string[];  // Topics/contexts where this is useful
    urgency: 'low' | 'medium' | 'high';
  };
  /** Processing status */
  status: 'raw' | 'extracted' | 'consolidated' | 'archived';
  /** Embedding of the content */
  embedding?: number[];
}

/**
 * MemScene: thematic cluster of related MemCells
 */
export interface MemScene {
  id: string;
  /** Theme/topic of this scene */
  theme: string;
  /** Summary of the scene */
  summary: string;
  /** MemCell IDs in this scene */
  cellIds: string[];
  /** Distilled semantic facts from the scene */
  semanticFacts: string[];
  /** User profile updates derived from this scene */
  profileUpdates: Array<{
    field: string;
    value: string;
    confidence: number;
    source: 'explicit' | 'implicit';
  }>;
  /** Creation timestamp */
  createdAt: Date;
  /** Last consolidation timestamp */
  lastConsolidatedAt: Date;
  /** Consolidation quality metadata */
  quality?: SceneQuality;
}

export interface SceneQualityBreakdown {
  uniqueness: number;
  contradictionSafety: number;
  compression: number;
  coverage: number;
  profileConsistency: number;
}

export interface SceneQuality {
  score: number;
  threshold: number;
  passed: boolean;
  rejectionReason?: string;
  attempts: number;
  breakdown: SceneQualityBreakdown;
}

/**
 * Recollection result from Phase 3
 */
export interface RecollectionResult {
  /** Assembled context string */
  context: string;
  /** Individual memory fragments used */
  fragments: Array<{
    content: string;
    source: 'episodic' | 'semantic' | 'procedural' | 'profile';
    relevance: number;
    memoryId?: string;
  }>;
  /** How the context was assembled */
  assembly: {
    strategy: 'direct' | 'graph_traversal' | 'consolidation_lookup' | 'hybrid';
    fragmentsConsidered: number;
    fragmentsSelected: number;
    compressionRatio: number;
    latencyMs: number;
  };
}

export interface LifecycleConfig {
  /** Maximum MemCells before triggering consolidation */
  consolidationThreshold: number;
  /** Similarity threshold for clustering MemCells into MemScenes */
  clusteringThreshold: number;
  /** Maximum context tokens for recollection */
  maxContextTokens: number;
  /** Whether to auto-consolidate on creation */
  autoConsolidate: boolean;
  /** Minimum quality score required for a generated scene */
  sceneQualityThreshold: number;
  /** Maximum regeneration attempts when quality gate fails */
  sceneQualityMaxRetries: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  consolidationThreshold: 50,
  clusteringThreshold: 0.75,
  maxContextTokens: 2000,
  autoConsolidate: true,
  sceneQualityThreshold: 0.58,
  sceneQualityMaxRetries: 1,
};

// ============================================
// Phase 1: Episodic Trace Formation
// ============================================

/**
 * Convert a conversation turn into a MemCell.
 *
 * Extracts atomic facts, assigns episodic trace, and
 * predicts relevance window (foresight).
 */
export async function formEpisodicTrace(
  content: string,
  speaker: 'user' | 'assistant' | 'system',
  sessionId?: string,
  turnNumber: number = 0
): Promise<MemCell> {
  const id = `mc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Extract atomic facts using LLM
  let atomicFacts: string[] = [];
  let foresight: MemCell['foresight'] = { urgency: 'low' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && content.length > 20) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: buildAnthropicHeaders(apiKey),
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 512,
          system: `Extract atomic facts and assess urgency. Return JSON:
{
  "facts": ["fact 1", "fact 2"],
  "urgency": "low" | "medium" | "high",
  "relevantFor": ["topic1", "topic2"],
  "expiresInDays": null | number
}
Only extract genuinely useful facts. Return {"facts":[],"urgency":"low","relevantFor":[],"expiresInDays":null} if nothing worth extracting.`,
          messages: [
            { role: 'user', content: content.slice(0, 2000) },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = JSON.parse(data.content?.[0]?.text || '{}');
        atomicFacts = parsed.facts || [];
        foresight = {
          urgency: parsed.urgency || 'low',
          relevantFor: parsed.relevantFor || [],
          relevantUntil: parsed.expiresInDays
            ? new Date(Date.now() + parsed.expiresInDays * 86400000)
            : undefined,
        };
      }
    } catch {
      // Fallback: treat entire content as single fact
      atomicFacts = [content];
    }
  } else {
    atomicFacts = content.length > 10 ? [content] : [];
  }

  // Generate embedding
  let embedding: number[] | undefined;
  try {
    embedding = await computeEmbedding(content, 'document');
  } catch {
    // Non-fatal
  }

  return {
    id,
    content,
    atomicFacts,
    episodicTrace: {
      speaker,
      timestamp: new Date(),
      sessionId,
      conversationTurn: turnNumber,
    },
    foresight,
    status: atomicFacts.length > 0 ? 'extracted' : 'raw',
    embedding,
  };
}

// ============================================
// Phase 2: Semantic Consolidation
// ============================================

/**
 * Consolidate MemCells into MemScenes.
 *
 * Groups related MemCells by embedding similarity,
 * generates summaries, and extracts profile updates.
 */
export async function consolidateMemCells(
  userId: string,
  cells: MemCell[],
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG
): Promise<MemScene[]> {
  if (cells.length === 0) return [];

  // Cluster cells by embedding similarity
  const clusters = clusterBySimilarity(cells, config.clusteringThreshold);

  const scenes: MemScene[] = [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const envThreshold = Number(process.env.LIFECYCLE_SCENE_MIN_QUALITY);
  const qualityThreshold = Number.isFinite(envThreshold)
    ? Math.max(0.3, Math.min(0.95, envThreshold))
    : config.sceneQualityThreshold;
  const envMaxRetries = Number(process.env.LIFECYCLE_SCENE_MAX_RETRIES);
  const sceneQualityMaxRetries = Number.isFinite(envMaxRetries)
    ? Math.max(0, Math.min(3, Math.floor(envMaxRetries)))
    : config.sceneQualityMaxRetries;

  for (const cluster of clusters) {
    if (cluster.length === 0) continue;

    const allFacts = deduplicateSemanticFacts(
      cluster.flatMap((c) => c.atomicFacts.length > 0 ? c.atomicFacts : [c.content])
    );
    const allContent = cluster.map((c) => c.content).join('\n');

    let attempts = 1;
    let scene = await generateSceneDraft(cluster, allFacts, allContent, apiKey);
    let quality = evaluateSceneQuality(scene, cluster, qualityThreshold);

    while (!quality.passed && attempts <= sceneQualityMaxRetries && !!apiKey) {
      scene = await generateSceneDraft(cluster, allFacts, allContent, apiKey, {
        previousSummary: scene.summary,
        rejectionReason: quality.rejectionReason,
      });
      attempts += 1;
      quality = evaluateSceneQuality(scene, cluster, qualityThreshold);
    }

    if (!quality.passed) {
      console.warn('[Lifecycle] Skipping low-quality consolidated scene', {
        userId,
        attempts,
        score: quality.score,
        threshold: quality.threshold,
        rejectionReason: quality.rejectionReason,
      });
      continue;
    }

    scenes.push({
      ...scene,
      quality: {
        ...quality,
        attempts,
      },
    });
  }

  // Store consolidated scenes and return persisted identifiers
  if (scenes.length === 0) {
    return [];
  }

  return storeMemScenes(userId, scenes);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeFactText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deduplicateSemanticFacts(facts: string[]): string[] {
  const dedup = new Map<string, string>();
  for (const fact of facts) {
    if (typeof fact !== 'string') continue;
    const trimmed = fact.trim();
    if (!trimmed) continue;
    const normalized = normalizeFactText(trimmed);
    if (!normalized) continue;
    if (!dedup.has(normalized)) {
      dedup.set(normalized, trimmed);
    }
  }
  return Array.from(dedup.values());
}

function overlapRatio(tokensA: Set<string>, tokensB: Set<string>): number {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.min(tokensA.size, tokensB.size);
}

function hasNegation(text: string): boolean {
  return /\b(not|never|no|cannot|can't|won't|isn't|aren't|didn't|don't|없|아니|못)\b/i.test(text);
}

function detectContradictionRisk(facts: string[]): number {
  const normalized = deduplicateSemanticFacts(facts).map((fact) => normalizeFactText(fact));
  if (normalized.length < 2) return 0;

  let comparablePairs = 0;
  let contradictionPairs = 0;

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i];
      const b = normalized[j];
      const overlap = overlapRatio(new Set(a.split(' ')), new Set(b.split(' ')));
      if (overlap < 0.65) continue;

      comparablePairs += 1;
      if (hasNegation(a) !== hasNegation(b)) {
        contradictionPairs += 1;
      }
    }
  }

  if (comparablePairs === 0) return 0;
  return clamp01(contradictionPairs / comparablePairs);
}

function computeCompressionScore(summary: string, sourceText: string): number {
  const sourceLength = sourceText.trim().length;
  const summaryLength = summary.trim().length;

  if (sourceLength === 0 || summaryLength === 0) {
    return 0;
  }

  const ratio = summaryLength / sourceLength;
  if (ratio >= 0.12 && ratio <= 0.5) return 1;
  if (ratio < 0.12) return clamp01(ratio / 0.12);
  if (ratio <= 0.8) return clamp01(1 - (ratio - 0.5) / 0.3);
  return 0;
}

function getWeakestComponentReason(breakdown: SceneQualityBreakdown): string {
  const components: Array<{ key: keyof SceneQualityBreakdown; value: number }> = [
    { key: 'uniqueness', value: breakdown.uniqueness },
    { key: 'contradictionSafety', value: breakdown.contradictionSafety },
    { key: 'compression', value: breakdown.compression },
    { key: 'coverage', value: breakdown.coverage },
    { key: 'profileConsistency', value: breakdown.profileConsistency },
  ];

  components.sort((a, b) => a.value - b.value);
  return components[0]?.key ?? 'overall';
}

export function evaluateSceneQuality(
  scene: Pick<MemScene, 'summary' | 'semanticFacts' | 'profileUpdates'>,
  cluster: Array<Pick<MemCell, 'content' | 'atomicFacts'>>,
  threshold: number
): SceneQuality {
  const semanticFacts = deduplicateSemanticFacts(scene.semanticFacts);
  const fallbackFacts = deduplicateSemanticFacts(cluster.flatMap((cell) => cell.atomicFacts));
  const evaluatedFacts = semanticFacts.length > 0 ? semanticFacts : fallbackFacts;

  const normalizedFacts = evaluatedFacts.map((fact) => normalizeFactText(fact));
  const uniqueness = normalizedFacts.length > 0
    ? new Set(normalizedFacts).size / normalizedFacts.length
    : 0;

  const contradictionSafety = 1 - detectContradictionRisk(evaluatedFacts);
  const sourceText = cluster.map((cell) => cell.content).join('\n');
  const compression = computeCompressionScore(scene.summary, sourceText);
  const coverage = clamp01(evaluatedFacts.length / Math.max(cluster.length, 1));
  const profileConsistency = scene.profileUpdates.length > 0
    ? clamp01(
      scene.profileUpdates.reduce((sum, update) => sum + clamp01(update.confidence), 0) /
      scene.profileUpdates.length
    )
    : 0.6;

  const breakdown: SceneQualityBreakdown = {
    uniqueness: round3(uniqueness),
    contradictionSafety: round3(contradictionSafety),
    compression: round3(compression),
    coverage: round3(coverage),
    profileConsistency: round3(profileConsistency),
  };

  const score = round3(
    breakdown.uniqueness * 0.35 +
    breakdown.contradictionSafety * 0.25 +
    breakdown.compression * 0.2 +
    breakdown.coverage * 0.1 +
    breakdown.profileConsistency * 0.1
  );

  const passed = score >= threshold;
  return {
    score,
    threshold: round3(threshold),
    passed,
    rejectionReason: passed ? undefined : getWeakestComponentReason(breakdown),
    attempts: 1,
    breakdown,
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Try extracting object from mixed text
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeProfileUpdates(
  raw: unknown
): MemScene['profileUpdates'] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const value = item as Record<string, unknown>;
      const field = typeof value.field === 'string' ? value.field.trim() : '';
      const profileValue = typeof value.value === 'string' ? value.value.trim() : '';
      if (!field || !profileValue) return null;

      const confidence = clamp01(
        typeof value.confidence === 'number'
          ? value.confidence
          : Number(value.confidence ?? 0.6)
      );
      const source: 'explicit' | 'implicit' = value.source === 'explicit' ? 'explicit' : 'implicit';

      return {
        field,
        value: profileValue,
        confidence: round3(confidence),
        source,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

async function generateSceneDraft(
  cluster: MemCell[],
  allFacts: string[],
  allContent: string,
  apiKey?: string,
  retryContext?: {
    previousSummary?: string;
    rejectionReason?: string;
  }
): Promise<MemScene> {
  let theme = 'General';
  let summary = allFacts.join('. ');
  let semanticFacts = allFacts;
  let profileUpdates: MemScene['profileUpdates'] = [];

  if (apiKey && allFacts.length > 1) {
    try {
      const strictClause = retryContext
        ? `Previous draft was rejected for ${retryContext.rejectionReason ?? 'low_quality'}. Improve factual consistency, deduplicate facts, and compress better.`
        : '';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: buildAnthropicHeaders(apiKey),
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 512,
          system: `Consolidate these memory fragments into a coherent scene. Return JSON:
{
  "theme": "short topic label",
  "summary": "2-3 sentence consolidated summary",
  "semanticFacts": ["distilled fact 1", "distilled fact 2"],
  "profileUpdates": [{"field": "name|preference|skill|etc", "value": "...", "confidence": 0.0-1.0, "source": "explicit|implicit"}]
}
Rules:
- Remove duplicate facts and avoid contradictions.
- Keep summary concise and information-dense.
- Prefer stable, user-relevant facts.
${strictClause}`,
          messages: [
            {
              role: 'user',
              content: `Facts:\n${allFacts.join('\n')}\n\nContext:\n${allContent.slice(0, 3000)}${
                retryContext?.previousSummary
                  ? `\n\nPrevious summary:\n${retryContext.previousSummary}`
                  : ''
              }`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json() as { content?: Array<{ text?: string }> };
        const parsed = parseJsonObject(data.content?.[0]?.text || '');
        if (parsed) {
          const parsedTheme = typeof parsed.theme === 'string' ? parsed.theme.trim() : '';
          const parsedSummary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
          if (parsedTheme) theme = parsedTheme;
          if (parsedSummary) summary = parsedSummary;

          if (Array.isArray(parsed.semanticFacts)) {
            semanticFacts = deduplicateSemanticFacts(
              parsed.semanticFacts.filter((fact): fact is string => typeof fact === 'string')
            );
          }
          profileUpdates = normalizeProfileUpdates(parsed.profileUpdates);
        }
      }
    } catch {
      // Use fallback values
    }
  }

  return {
    id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    theme,
    summary,
    cellIds: cluster.map((c) => c.id),
    semanticFacts: semanticFacts.length > 0 ? semanticFacts : allFacts,
    profileUpdates,
    createdAt: new Date(),
    lastConsolidatedAt: new Date(),
  };
}

/**
 * Cluster MemCells by embedding similarity using greedy algorithm.
 */
function clusterBySimilarity(
  cells: MemCell[],
  threshold: number
): MemCell[][] {
  const clusters: MemCell[][] = [];
  const assigned = new Set<string>();

  for (const cell of cells) {
    if (assigned.has(cell.id) || !cell.embedding) {
      if (!assigned.has(cell.id)) {
        clusters.push([cell]);
        assigned.add(cell.id);
      }
      continue;
    }

    // Find best existing cluster
    let bestCluster = -1;
    let bestSim = 0;

    for (let ci = 0; ci < clusters.length; ci++) {
      const representative = clusters[ci][0];
      if (!representative.embedding) continue;

      const sim = cosineSimilarity(cell.embedding, representative.embedding);
      if (sim > bestSim && sim >= threshold) {
        bestSim = sim;
        bestCluster = ci;
      }
    }

    if (bestCluster >= 0) {
      clusters[bestCluster].push(cell);
    } else {
      clusters.push([cell]);
    }
    assigned.add(cell.id);
  }

  return clusters;
}

/**
 * Store MemScenes in database for persistent consolidation.
 */
function normalizeEmbeddingVector(raw: unknown): number[] | undefined {
  if (Array.isArray(raw)) {
    const vector = raw
      .map((value) => (typeof value === 'number' ? value : Number(value)))
      .filter((value) => Number.isFinite(value));
    return vector.length > 0 ? vector : undefined;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeEmbeddingVector(parsed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function inferUrgencyFromImportance(importance: number): MemCell['foresight']['urgency'] {
  if (importance >= 8) return 'high';
  if (importance >= 6) return 'medium';
  return 'low';
}

function calculateSceneImportance(scene: MemScene): number {
  const profileConfidence = scene.profileUpdates.length > 0
    ? scene.profileUpdates.reduce((sum, update) => sum + update.confidence, 0) /
      scene.profileUpdates.length
    : 0.5;
  const qualityBoost = scene.quality?.score ?? 0.5;

  return Math.min(
    10,
    Math.max(1, Math.round((4 + profileConfidence * 2 + qualityBoost * 4) * 100) / 100)
  );
}

function isMissingMetadataColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string };
  const text = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
  return err.code === '42703' || (
    text.includes('column') &&
    text.includes('metadata') &&
    text.includes('does not exist')
  );
}

function isMissingSceneProfileSyncTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string };
  const text = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
  return err.code === '42P01' || text.includes('memory_scene_profile_sync_events');
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapProfileFieldToSlotKey(field: string): string | null {
  const normalized = field.trim().toLowerCase();
  if (!normalized) return null;

  if (VALID_SLOT_KEYS.includes(normalized)) {
    return normalized;
  }

  const mappings: Array<{ pattern: RegExp; slotKey: string }> = [
    { pattern: /(^|\.)(name|full_name)$/, slotKey: 'user.name' },
    { pattern: /(^|\.)(email|e-mail)$/, slotKey: 'user.email' },
    { pattern: /(^|\.)(phone|mobile|tel)$/, slotKey: 'user.phone' },
    { pattern: /(^|\.)(job|title|role|position)$/, slotKey: 'user.job_title' },
    { pattern: /(^|\.)(company|organization|org)$/, slotKey: 'user.company' },
    { pattern: /(^|\.)(timezone|time_zone)$/, slotKey: 'user.timezone' },
    { pattern: /(^|\.)(location|city|country)$/, slotKey: 'user.location' },
    { pattern: /(^|\.)(language|lang)$/, slotKey: 'preference.language' },
    { pattern: /(^|\.)(theme|mode)$/, slotKey: 'preference.theme' },
    { pattern: /(^|\.)(communication_style|communication|formality|response_style)$/, slotKey: 'preference.communication_style' },
    { pattern: /(^|\.)(restriction|avoid|privacy|forbidden)$/, slotKey: 'restriction.general' },
    { pattern: /(^|\.)(project|current_project)$/, slotKey: 'project.current_project' },
    { pattern: /(^|\.)(tech_stack|stack|framework)$/, slotKey: 'project.tech_stack' },
    { pattern: /(^|\.)(goal|working_on)$/, slotKey: 'context.current_goal' },
    { pattern: /(^|\.)(deadline)$/, slotKey: 'context.deadline' },
    { pattern: /(^|\.)(priority)$/, slotKey: 'context.priority' },
  ];

  for (const mapping of mappings) {
    if (mapping.pattern.test(normalized)) {
      return mapping.slotKey;
    }
  }

  return null;
}

function buildSceneUpdateSummaryLines(
  updates: Array<{ field: string; value: string; confidence: number; slotKey: string }>
): string[] {
  return updates.map((update) =>
    `- ${update.slotKey}: ${update.value} (confidence ${round3(update.confidence)})`
  );
}

async function writeSceneSyncTrace(
  supabase: ReturnType<typeof createServerClient>,
  payload: {
    userId: string;
    namespace: string;
    sceneId: string;
    sceneTheme: string;
    field: string;
    value: string;
    confidence: number;
    slotKey: string | null;
    status: 'applied' | 'skipped' | 'failed';
    reason?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('memory_scene_profile_sync_events')
    .insert({
      user_id: payload.userId,
      namespace: payload.namespace,
      scene_id: payload.sceneId,
      scene_theme: payload.sceneTheme,
      update_field: payload.field,
      slot_key: payload.slotKey,
      slot_value: payload.value,
      confidence: round3(payload.confidence),
      status: payload.status,
      reason: payload.reason || null,
      metadata: {},
    });

  if (error && !isMissingSceneProfileSyncTableError(error)) {
    throw error;
  }
}

async function syncSceneProfileUpdates(
  userId: string,
  scene: MemScene,
  namespace: string = 'default'
): Promise<void> {
  if (!Array.isArray(scene.profileUpdates) || scene.profileUpdates.length === 0) return;

  const supabase = createServerClient();
  const minConfidence = clamp01(
    toFiniteNumber(process.env.LIFECYCLE_PROFILE_SYNC_MIN_CONFIDENCE, 0.65)
  );

  const appliedUpdates: Array<{ field: string; value: string; confidence: number; slotKey: string }> = [];
  const mergedSlotSnapshot: Record<string, string> = {};
  let skippedCount = 0;
  let failedCount = 0;

  const { data: existingProfile } = await supabase
    .from('memory_profiles')
    .select('profile_card, slot_snapshot, memory_count, cluster_count')
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .maybeSingle();

  if (existingProfile?.slot_snapshot && typeof existingProfile.slot_snapshot === 'object') {
    Object.assign(mergedSlotSnapshot, existingProfile.slot_snapshot as Record<string, string>);
  }

  for (const update of scene.profileUpdates) {
    const confidence = clamp01(update.confidence);
    const slotKey = mapProfileFieldToSlotKey(update.field);

    if (confidence < minConfidence) {
      skippedCount += 1;
      await writeSceneSyncTrace(supabase, {
        userId,
        namespace,
        sceneId: scene.id,
        sceneTheme: scene.theme,
        field: update.field,
        value: update.value,
        confidence,
        slotKey,
        status: 'skipped',
        reason: 'low_confidence',
      });
      continue;
    }

    if (!slotKey) {
      skippedCount += 1;
      await writeSceneSyncTrace(supabase, {
        userId,
        namespace,
        sceneId: scene.id,
        sceneTheme: scene.theme,
        field: update.field,
        value: update.value,
        confidence,
        slotKey: null,
        status: 'skipped',
        reason: 'unmapped_field',
      });
      continue;
    }

    const slotResult = await upsertSlot(userId, slotKey, update.value, {
      namespace,
      confidence,
      source: 'lifecycle_scene',
    });

    if (!slotResult.success) {
      failedCount += 1;
      await writeSceneSyncTrace(supabase, {
        userId,
        namespace,
        sceneId: scene.id,
        sceneTheme: scene.theme,
        field: update.field,
        value: update.value,
        confidence,
        slotKey,
        status: 'failed',
        reason: slotResult.error || 'slot_upsert_failed',
      });
      continue;
    }

    mergedSlotSnapshot[slotKey] = update.value;
    appliedUpdates.push({
      field: update.field,
      value: update.value,
      confidence,
      slotKey,
    });

    await writeSceneSyncTrace(supabase, {
      userId,
      namespace,
      sceneId: scene.id,
      sceneTheme: scene.theme,
      field: update.field,
      value: update.value,
      confidence,
      slotKey,
      status: 'applied',
    });
  }

  if (appliedUpdates.length > 0) {
    const summaryBlock = [
      'Recent consolidated signals:',
      ...buildSceneUpdateSummaryLines(appliedUpdates),
    ].join('\n');
    const previousProfileCard =
      typeof existingProfile?.profile_card === 'string' ? existingProfile.profile_card : '';
    const nextProfileCard = [previousProfileCard, summaryBlock]
      .filter((part) => part && part.trim().length > 0)
      .join('\n\n')
      .slice(0, 2000);

    const { error: profileUpdateError } = await supabase.rpc('update_profile_card', {
      p_user_id: userId,
      p_namespace: namespace,
      p_profile_card: nextProfileCard || summaryBlock,
      p_slot_snapshot: mergedSlotSnapshot,
      p_slot_count: Object.keys(mergedSlotSnapshot).length,
      p_memory_count: existingProfile?.memory_count ?? null,
      p_cluster_count: existingProfile?.cluster_count ?? null,
    });

    if (profileUpdateError) {
      console.error('[Lifecycle] Failed to update profile card from scene sync:', profileUpdateError);
    }
  }

  await logAuditEvent({
    userId,
    action: 'memory.scene_profile_sync',
    resourceType: 'memory_scene',
    resourceId: scene.id,
    details: {
      namespace,
      theme: scene.theme,
      applied_count: appliedUpdates.length,
      skipped_count: skippedCount,
      failed_count: failedCount,
    },
    status: failedCount > 0 ? 'failed' : 'success',
  });
}

/**
 * Load lifecycle-extracted memories that are not yet included in any active cluster.
 * These are the candidate MemCells for phase-2 semantic consolidation.
 */
async function loadUnclusteredLifecycleMemCells(
  userId: string,
  maxCells: number
): Promise<MemCell[]> {
  const supabase = createServerClient();
  const readLimit = Math.max(maxCells * 3, maxCells);

  const [memoriesResult, clustersResult] = await Promise.all([
    supabase
      .from('memories')
      .select('id, content, embedding, created_at, importance')
      .eq('user_id', userId)
      .eq('namespace', 'default')
      .eq('source', 'lifecycle_extraction')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(readLimit),
    supabase
      .from('memory_clusters')
      .select('member_ids')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (memoriesResult.error || !memoriesResult.data || memoriesResult.data.length === 0) {
    return [];
  }

  const clusteredIds = new Set<string>();
  if (!clustersResult.error && clustersResult.data) {
    for (const cluster of clustersResult.data as Array<{ member_ids?: unknown }>) {
      if (!Array.isArray(cluster.member_ids)) continue;
      for (const id of cluster.member_ids) {
        clusteredIds.add(String(id));
      }
    }
  }

  const candidates = (memoriesResult.data as Array<{
    id: string;
    content: string;
    embedding?: unknown;
    created_at: string;
    importance?: number;
  }>)
    .filter((memory) => !clusteredIds.has(String(memory.id)))
    .slice(0, maxCells);

  return candidates.map((memory) => {
    const importance = typeof memory.importance === 'number' ? memory.importance : 5;
    const content = memory.content || '';
    return {
      id: String(memory.id),
      content,
      atomicFacts: content.length > 0 ? [content] : [],
      episodicTrace: {
        speaker: 'user',
        timestamp: new Date(memory.created_at),
        conversationTurn: 0,
      },
      foresight: {
        urgency: inferUrgencyFromImportance(importance),
      },
      status: 'extracted',
      embedding: normalizeEmbeddingVector(memory.embedding),
    } satisfies MemCell;
  });
}

async function storeMemScenes(
  userId: string,
  scenes: MemScene[]
): Promise<MemScene[]> {
  const supabase = createServerClient();
  const persisted: MemScene[] = [];

  for (const scene of scenes) {
    const basePayload = {
      user_id: userId,
      namespace: 'default',
      cluster_name: scene.theme,
      cluster_type: 'semantic',
      summary: scene.summary,
      member_ids: scene.cellIds,
      member_count: scene.cellIds.length,
      importance: calculateSceneImportance(scene),
    };

    const metadataPayload = {
      ...basePayload,
      metadata: {
        quality: scene.quality ?? null,
        semanticFacts: scene.semanticFacts,
        profileUpdates: scene.profileUpdates,
      },
    };

    let { data, error } = await supabase
      .from('memory_clusters')
      .insert(metadataPayload)
      .select('id, cluster_name, summary, member_ids, created_at, updated_at')
      .single();

    if (error && isMissingMetadataColumnError(error)) {
      const fallbackInsert = await supabase
        .from('memory_clusters')
        .insert(basePayload)
        .select('id, cluster_name, summary, member_ids, created_at, updated_at')
        .single();

      data = fallbackInsert.data;
      error = fallbackInsert.error;
    }

    if (error || !data) {
      console.error('Failed to persist consolidated MemScene:', error);
      continue;
    }

    const persistedScene: MemScene = {
      ...scene,
      id: String(data.id),
      theme: data.cluster_name ?? scene.theme,
      summary: data.summary ?? scene.summary,
      cellIds: Array.isArray(data.member_ids)
        ? data.member_ids.map((id: unknown) => String(id))
        : scene.cellIds,
      createdAt: data.created_at ? new Date(data.created_at) : scene.createdAt,
      lastConsolidatedAt: data.updated_at ? new Date(data.updated_at) : scene.lastConsolidatedAt,
    };

    try {
      await syncSceneProfileUpdates(userId, persistedScene, 'default');
    } catch (syncError) {
      console.error('[Lifecycle] Scene profile sync failed:', syncError);
    }

    persisted.push(persistedScene);
  }

  return persisted;
}

async function loadRecentSceneSummaries(
  userId: string,
  limit: number
): Promise<Array<{ name: string; summary: string }>> {
  const supabase = createServerClient();

  const modern = await supabase
    .from('memory_clusters')
    .select('cluster_name, summary')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!modern.error && modern.data) {
    return (modern.data as Array<{ cluster_name?: string; summary?: string }>).map((scene) => ({
      name: scene.cluster_name || 'Cluster',
      summary: scene.summary || '',
    }));
  }

  const legacy = await supabase
    .from('memory_clusters')
    .select('name, summary')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (legacy.error || !legacy.data) {
    return [];
  }

  return (legacy.data as Array<{ name?: string; summary?: string }>).map((scene) => ({
    name: scene.name || 'Cluster',
    summary: scene.summary || '',
  }));
}

// ============================================
// Phase 3: Reconstructive Recollection
// ============================================

/**
 * Reconstruct relevant context for a query.
 *
 * Composes the necessary and sufficient context from multiple
 * memory sources: episodic, semantic, procedural, and user profile.
 */
export async function reconstructContext(
  userId: string,
  query: string,
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG
): Promise<RecollectionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  const fragments: RecollectionResult['fragments'] = [];
  let fragmentsConsidered = 0;

  // 1. Search semantic memories (vector search)
  try {
    const queryEmbedding = await computeEmbedding(query, 'query');

    const { data: semanticResults } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_threshold: 0.65,
      match_count: 15,
      match_user_id: userId,
    });

    if (semanticResults) {
      fragmentsConsidered += semanticResults.length;

      for (const result of semanticResults.slice(0, 8)) {
        fragments.push({
          content: result.content,
          source: 'semantic',
          relevance: result.similarity,
          memoryId: result.id,
        });
      }
    }
  } catch {
    // Continue with other sources
  }

  // 2. Check user profile for context
  try {
    const { data: profile } = await supabase
      .from('memory_profiles')
      .select('profile_card')
      .eq('user_id', userId)
      .single();

    if (profile?.profile_card) {
      fragments.push({
        content: profile.profile_card,
        source: 'profile',
        relevance: 0.8,
      });
      fragmentsConsidered++;
    }
  } catch {
    // Non-fatal
  }

  // 3. Check slots for direct-match queries
  try {
    const { data: slots } = await supabase
      .from('memory_slots')
      .select('category, slot_key, value')
      .eq('user_id', userId)
      .limit(20);

    if (slots && slots.length > 0) {
      const slotContext = slots
        .map((s) => `${s.slot_key}: ${s.value}`)
        .join('\n');

      fragments.push({
        content: slotContext,
        source: 'procedural',
        relevance: 0.9,
      });
      fragmentsConsidered += slots.length;
    }
  } catch {
    // Non-fatal
  }

  // 4. Check consolidated scenes for thematic context
  try {
    const scenes = await loadRecentSceneSummaries(userId, 5);

    for (const scene of scenes) {
      fragments.push({
        content: `[${scene.name}] ${scene.summary}`,
        source: 'episodic',
        relevance: 0.6,
      });
    }
    fragmentsConsidered += scenes.length;
  } catch {
    // Non-fatal
  }

  // 5. Sort by relevance and assemble context
  fragments.sort((a, b) => b.relevance - a.relevance);
  const selectedFragments = fragments.slice(0, 10);

  // Estimate token count (rough: 1 token -> 4 chars)
  let tokenEstimate = 0;
  const contextParts: string[] = [];

  for (const fragment of selectedFragments) {
    const fragmentTokens = Math.ceil(fragment.content.length / 4);
    if (tokenEstimate + fragmentTokens > config.maxContextTokens) break;

    contextParts.push(fragment.content);
    tokenEstimate += fragmentTokens;
  }

  const context = contextParts.join('\n\n');

  return {
    context,
    fragments: selectedFragments,
    assembly: {
      strategy: fragments.length > 5 ? 'hybrid' : 'direct',
      fragmentsConsidered,
      fragmentsSelected: selectedFragments.length,
      compressionRatio:
        fragmentsConsidered > 0
          ? selectedFragments.length / fragmentsConsidered
          : 1,
      latencyMs: Date.now() - startTime,
    },
  };
}

// ============================================
// Full Pipeline
// ============================================

/**
 * Run the complete lifecycle pipeline for a conversation turn.
 *
 * 1. Form episodic trace (MemCell)
 * 2. Check if consolidation is needed
 * 3. If yes, consolidate into MemScenes
 */
export async function processConversationTurn(
  userId: string,
  content: string,
  speaker: 'user' | 'assistant',
  sessionId?: string,
  turnNumber: number = 0,
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG
): Promise<{
  memCell: MemCell;
  consolidated: boolean;
  scenes?: MemScene[];
}> {
  // Phase 1: Form episodic trace
  const memCell = await formEpisodicTrace(content, speaker, sessionId, turnNumber);

  // Store the MemCell as a memory
  if (memCell.atomicFacts.length > 0 && memCell.embedding) {
    const supabase = createServerClient();

    for (const fact of memCell.atomicFacts) {
      const factEmbedding = await computeEmbedding(fact, 'document');

      await supabase.from('memories').insert({
        user_id: userId,
        content: fact,
        embedding: factEmbedding,
        memory_type: 'fact',
        source: 'lifecycle_extraction',
        importance: memCell.foresight.urgency === 'high' ? 8 : memCell.foresight.urgency === 'medium' ? 6 : 5,
        tags: ['auto-extracted', 'lifecycle', ...(memCell.foresight.relevantFor || [])],
        is_encrypted: false,
        is_deleted: false,
        deleted_at: null,
      });
    }
  }

  // Check if consolidation is needed
  let consolidated = false;
  let scenes: MemScene[] | undefined;

  if (config.autoConsolidate) {
    const candidates = await loadUnclusteredLifecycleMemCells(
      userId,
      config.consolidationThreshold * 2
    );

    if (candidates.length >= config.consolidationThreshold) {
      scenes = await consolidateMemCells(userId, candidates, config);
      consolidated = scenes.length > 0;
    }
  }

  return { memCell, consolidated, scenes };
}
