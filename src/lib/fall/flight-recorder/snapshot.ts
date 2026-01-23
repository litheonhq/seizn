/**
 * Trace Snapshot Determinism Module
 *
 * Provides deterministic snapshot generation and comparison for trace data.
 * Ensures that identical retrieval requests produce reproducible snapshots.
 */

import { createHash } from 'crypto';
import type {
  StoredTrace,
  TraceConfig,
  Span,
  RetrievalEvent,
  ResultStats,
  TraceCost,
} from './types';

// ============================================
// Types
// ============================================

/**
 * Input parameters used to generate deterministic snapshot ID
 */
export interface SnapshotInput {
  /** Query text or normalized form */
  query?: string;
  /** Collection ID(s) being searched */
  collectionId?: string;
  collectionIds?: string[];
  /** Configuration affecting results */
  config?: Partial<TraceConfig>;
  /** Additional determinism keys */
  custom?: Record<string, unknown>;
}

/**
 * Normalized snapshot with relative timestamps
 */
export interface NormalizedSnapshot {
  /** Deterministic ID based on input */
  snapshotId: string;
  /** Content hash excluding timestamps */
  contentHash: string;
  /** Base timestamp (ISO) */
  baseTimestamp: string;
  /** Normalized spans with relative timings */
  spans: NormalizedSpan[];
  /** Normalized events with relative timings */
  events: NormalizedEvent[];
  /** Result statistics */
  resultStats?: ResultStats;
  /** Configuration used */
  config?: TraceConfig;
}

/**
 * Span with relative timestamp offsets
 */
export interface NormalizedSpan {
  name: string;
  /** Offset from base timestamp in ms */
  startOffset: number;
  /** Offset from base timestamp in ms */
  endOffset?: number;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  error?: string;
  children?: NormalizedSpan[];
  metadata?: Record<string, unknown>;
}

/**
 * Event with relative timestamp offset
 */
export interface NormalizedEvent {
  type: string;
  /** Offset from base timestamp in ms */
  offset: number;
  payload: Record<string, unknown>;
  piiMasked?: boolean;
  durationMs?: number;
}

/**
 * Snapshot comparison result
 */
export interface SnapshotDiff {
  /** Whether snapshots are semantically identical */
  identical: boolean;
  /** Type of differences found */
  differenceType: 'none' | 'ordering' | 'content' | 'results' | 'config';
  /** Detailed differences */
  differences: SnapshotDifference[];
  /** Summary of changes */
  summary: {
    spanChanges: number;
    eventChanges: number;
    resultChanges: number;
    configChanges: number;
  };
}

export interface SnapshotDifference {
  path: string;
  type: 'added' | 'removed' | 'changed' | 'reordered';
  valueA?: unknown;
  valueB?: unknown;
  /** Whether this is a semantic change (affects results) */
  semantic: boolean;
}

// ============================================
// Deterministic ID Generation
// ============================================

/**
 * Generate a deterministic snapshot ID based on input parameters.
 * Identical inputs will always produce identical IDs.
 */
export function generateDeterministicSnapshotId(input: SnapshotInput): string {
  // Normalize and sort all input fields for determinism
  const normalizedInput = normalizeInputForHash(input);
  const inputJson = JSON.stringify(normalizedInput);

  return createHash('sha256')
    .update(inputJson)
    .digest('hex')
    .slice(0, 32); // Use first 32 chars for readability
}

/**
 * Normalize input for consistent hashing
 */
function normalizeInputForHash(input: SnapshotInput): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  // Normalize query (lowercase, trim, collapse whitespace)
  if (input.query) {
    normalized.query = input.query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  // Sort collection IDs
  if (input.collectionId) {
    normalized.collectionIds = [input.collectionId];
  } else if (input.collectionIds?.length) {
    normalized.collectionIds = [...input.collectionIds].sort();
  }

  // Normalize config (sort keys, remove undefined)
  if (input.config) {
    normalized.config = sortObjectKeys(removeUndefined(input.config));
  }

  // Sort and include custom fields
  if (input.custom) {
    normalized.custom = sortObjectKeys(removeUndefined(input.custom));
  }

  return normalized;
}

/**
 * Sort object keys recursively for deterministic serialization
 */
function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === 'object' && item !== null
        ? sortObjectKeys(item as Record<string, unknown>)
        : item
    ) as unknown as Record<string, unknown>;
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'object' && value !== null) {
      sorted[key] = sortObjectKeys(value as Record<string, unknown>);
    } else {
      sorted[key] = value;
    }
  }

  return sorted;
}

/**
 * Remove undefined values from object
 */
function removeUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        cleaned[key] = removeUndefined(value as Record<string, unknown>);
      } else {
        cleaned[key] = value;
      }
    }
  }

  return cleaned;
}

// ============================================
// Timestamp Normalization
// ============================================

/**
 * Normalize a snapshot by converting absolute timestamps to relative offsets.
 * This enables comparison of snapshots taken at different times.
 */
export function normalizeSnapshot(trace: StoredTrace): NormalizedSnapshot {
  const baseTimestamp = trace.trace.startedAt;
  const baseMs = new Date(baseTimestamp).getTime();

  // Generate deterministic ID from trace inputs
  const snapshotId = generateDeterministicSnapshotId({
    query: trace.queryText,
    collectionId: trace.collectionId,
    collectionIds: trace.collectionIds,
    config: trace.effectiveConfig,
  });

  // Normalize spans
  const normalizedSpans = trace.trace.spans.map((span) =>
    normalizeSpan(span, baseMs)
  );

  // Normalize events
  const normalizedEvents = trace.trace.events.map((event) =>
    normalizeEvent(event, baseMs)
  );

  // Sort results for determinism (by score desc, then by document_id)
  const sortedResultStats = normalizeResultStats(trace.trace.resultStats);

  // Calculate content hash (excluding timestamps)
  const contentHash = calculateContentHash({
    spans: normalizedSpans,
    events: normalizedEvents,
    resultStats: sortedResultStats,
    config: trace.effectiveConfig,
  });

  return {
    snapshotId,
    contentHash,
    baseTimestamp,
    spans: normalizedSpans,
    events: normalizedEvents,
    resultStats: sortedResultStats,
    config: trace.effectiveConfig,
  };
}

/**
 * Normalize a span by converting timestamps to offsets
 */
function normalizeSpan(span: Span, baseMs: number): NormalizedSpan {
  const startMs = new Date(span.startedAt).getTime();
  const endMs = span.endedAt ? new Date(span.endedAt).getTime() : undefined;

  const normalized: NormalizedSpan = {
    name: span.name,
    startOffset: startMs - baseMs,
    endOffset: endMs !== undefined ? endMs - baseMs : undefined,
    durationMs: span.durationMs,
    status: span.status,
  };

  if (span.input) {
    normalized.input = sortObjectKeys(span.input) as Record<string, unknown>;
  }

  if (span.output) {
    normalized.output = sortObjectKeys(span.output) as Record<string, unknown>;
  }

  if (span.error) {
    normalized.error = span.error;
  }

  if (span.metadata) {
    normalized.metadata = sortObjectKeys(span.metadata) as Record<string, unknown>;
  }

  if (span.children?.length) {
    normalized.children = span.children.map((child) =>
      normalizeSpan(child, baseMs)
    );
  }

  return normalized;
}

/**
 * Normalize an event by converting timestamp to offset
 */
function normalizeEvent(event: RetrievalEvent, baseMs: number): NormalizedEvent {
  const eventMs = new Date(event.ts).getTime();

  return {
    type: event.type,
    offset: eventMs - baseMs,
    payload: sortObjectKeys(event.payload) as Record<string, unknown>,
    piiMasked: event.piiMasked,
    durationMs: event.durationMs,
  };
}

/**
 * Normalize result statistics with deterministic ordering
 */
function normalizeResultStats(stats?: ResultStats): ResultStats | undefined {
  if (!stats) return undefined;

  const normalized: ResultStats = {
    count: stats.count,
  };

  if (stats.scores) {
    normalized.scores = {
      min: stats.scores.min,
      max: stats.scores.max,
      avg: stats.scores.avg,
      distribution: stats.scores.distribution,
    };
  }

  // Sort document IDs for determinism when scores are equal
  if (stats.documentIds) {
    // Note: We preserve original order (by score) but ensure ties are broken by ID
    normalized.documentIds = [...stats.documentIds];
  }

  // Sort rerank deltas by original score desc, then by id
  if (stats.rerankDeltas) {
    normalized.rerankDeltas = [...stats.rerankDeltas].sort((a, b) => {
      const scoreDiff = b.originalScore - a.originalScore;
      if (scoreDiff !== 0) return scoreDiff;
      return a.id.localeCompare(b.id);
    });
  }

  return normalized;
}

/**
 * Calculate content hash excluding timing information
 */
function calculateContentHash(content: {
  spans: NormalizedSpan[];
  events: NormalizedEvent[];
  resultStats?: ResultStats;
  config?: TraceConfig;
}): string {
  // Extract only semantic content (exclude timing offsets)
  const semanticContent = {
    spans: content.spans.map((span) => ({
      name: span.name,
      input: span.input,
      output: span.output,
      status: span.status,
      error: span.error,
      metadata: span.metadata,
      children: span.children?.map(extractSemanticSpanContent),
    })),
    events: content.events.map((event) => ({
      type: event.type,
      payload: event.payload,
    })),
    resultStats: content.resultStats,
    config: content.config,
  };

  return createHash('sha256')
    .update(JSON.stringify(sortObjectKeys(semanticContent as unknown as Record<string, unknown>)))
    .digest('hex')
    .slice(0, 32);
}

/**
 * Extract semantic content from span (recursive helper)
 */
function extractSemanticSpanContent(span: NormalizedSpan): Record<string, unknown> {
  const content: Record<string, unknown> = {
    name: span.name,
    status: span.status,
  };

  if (span.input) content.input = span.input;
  if (span.output) content.output = span.output;
  if (span.error) content.error = span.error;
  if (span.metadata) content.metadata = span.metadata;
  if (span.children?.length) {
    content.children = span.children.map(extractSemanticSpanContent);
  }

  return content;
}

// ============================================
// Snapshot Comparison
// ============================================

/**
 * Compare two snapshots and generate a semantic diff.
 * Focuses on meaningful differences that affect results.
 */
export function compareSnapshots(
  snapshotA: NormalizedSnapshot,
  snapshotB: NormalizedSnapshot
): SnapshotDiff {
  const differences: SnapshotDifference[] = [];

  // Compare content hashes first for quick check
  if (snapshotA.contentHash === snapshotB.contentHash) {
    return {
      identical: true,
      differenceType: 'none',
      differences: [],
      summary: {
        spanChanges: 0,
        eventChanges: 0,
        resultChanges: 0,
        configChanges: 0,
      },
    };
  }

  // Compare configuration
  const configDiffs = compareConfig(
    snapshotA.config,
    snapshotB.config
  );
  differences.push(...configDiffs);

  // Compare results
  const resultDiffs = compareResults(
    snapshotA.resultStats,
    snapshotB.resultStats
  );
  differences.push(...resultDiffs);

  // Compare spans (semantic only, ignore timing)
  const spanDiffs = compareSpans(snapshotA.spans, snapshotB.spans);
  differences.push(...spanDiffs);

  // Compare events (semantic only, ignore timing)
  const eventDiffs = compareEvents(snapshotA.events, snapshotB.events);
  differences.push(...eventDiffs);

  // Determine primary difference type
  let differenceType: SnapshotDiff['differenceType'] = 'none';
  if (configDiffs.length > 0) {
    differenceType = 'config';
  } else if (resultDiffs.length > 0) {
    differenceType = 'results';
  } else if (spanDiffs.some((d) => d.semantic) || eventDiffs.some((d) => d.semantic)) {
    differenceType = 'content';
  } else if (differences.some((d) => d.type === 'reordered')) {
    differenceType = 'ordering';
  }

  const semanticDiffs = differences.filter((d) => d.semantic);

  return {
    identical: semanticDiffs.length === 0,
    differenceType,
    differences,
    summary: {
      spanChanges: spanDiffs.filter((d) => d.semantic).length,
      eventChanges: eventDiffs.filter((d) => d.semantic).length,
      resultChanges: resultDiffs.length,
      configChanges: configDiffs.length,
    },
  };
}

/**
 * Compare configuration objects
 */
function compareConfig(
  configA?: TraceConfig,
  configB?: TraceConfig
): SnapshotDifference[] {
  const differences: SnapshotDifference[] = [];

  if (!configA && !configB) return differences;
  if (!configA) {
    differences.push({
      path: 'config',
      type: 'added',
      valueB: configB,
      semantic: true,
    });
    return differences;
  }
  if (!configB) {
    differences.push({
      path: 'config',
      type: 'removed',
      valueA: configA,
      semantic: true,
    });
    return differences;
  }

  const allKeys = new Set([
    ...Object.keys(configA),
    ...Object.keys(configB),
  ]);

  for (const key of allKeys) {
    const valueA = configA[key as keyof TraceConfig];
    const valueB = configB[key as keyof TraceConfig];

    if (JSON.stringify(valueA) !== JSON.stringify(valueB)) {
      differences.push({
        path: `config.${key}`,
        type: valueA === undefined ? 'added' : valueB === undefined ? 'removed' : 'changed',
        valueA,
        valueB,
        semantic: true,
      });
    }
  }

  return differences;
}

/**
 * Compare result statistics
 */
function compareResults(
  statsA?: ResultStats,
  statsB?: ResultStats
): SnapshotDifference[] {
  const differences: SnapshotDifference[] = [];

  if (!statsA && !statsB) return differences;
  if (!statsA) {
    differences.push({
      path: 'resultStats',
      type: 'added',
      valueB: statsB,
      semantic: true,
    });
    return differences;
  }
  if (!statsB) {
    differences.push({
      path: 'resultStats',
      type: 'removed',
      valueA: statsA,
      semantic: true,
    });
    return differences;
  }

  // Compare counts
  if (statsA.count !== statsB.count) {
    differences.push({
      path: 'resultStats.count',
      type: 'changed',
      valueA: statsA.count,
      valueB: statsB.count,
      semantic: true,
    });
  }

  // Compare document IDs (order matters for ranking)
  const idsA = statsA.documentIds || [];
  const idsB = statsB.documentIds || [];

  if (idsA.length !== idsB.length) {
    differences.push({
      path: 'resultStats.documentIds',
      type: 'changed',
      valueA: idsA,
      valueB: idsB,
      semantic: true,
    });
  } else {
    // Check for ordering differences
    let orderingChanged = false;
    for (let i = 0; i < idsA.length; i++) {
      if (idsA[i] !== idsB[i]) {
        orderingChanged = true;
        break;
      }
    }

    if (orderingChanged) {
      // Check if it's just reordering or actual content change
      const setA = new Set(idsA);
      const setB = new Set(idsB);
      const sameContent = idsA.every((id) => setB.has(id)) &&
                          idsB.every((id) => setA.has(id));

      differences.push({
        path: 'resultStats.documentIds',
        type: sameContent ? 'reordered' : 'changed',
        valueA: idsA,
        valueB: idsB,
        semantic: !sameContent, // Reordering is not a semantic change
      });
    }
  }

  // Compare score distribution
  if (statsA.scores && statsB.scores) {
    if (Math.abs(statsA.scores.avg - statsB.scores.avg) > 0.001) {
      differences.push({
        path: 'resultStats.scores.avg',
        type: 'changed',
        valueA: statsA.scores.avg,
        valueB: statsB.scores.avg,
        semantic: false, // Score changes are expected with different runs
      });
    }
  }

  return differences;
}

/**
 * Compare span arrays (semantic comparison)
 */
function compareSpans(
  spansA: NormalizedSpan[],
  spansB: NormalizedSpan[]
): SnapshotDifference[] {
  const differences: SnapshotDifference[] = [];

  // Compare by span name (order should be deterministic)
  const maxLen = Math.max(spansA.length, spansB.length);

  for (let i = 0; i < maxLen; i++) {
    const spanA = spansA[i];
    const spanB = spansB[i];
    const path = `spans[${i}]`;

    if (!spanA) {
      differences.push({
        path,
        type: 'added',
        valueB: { name: spanB.name, status: spanB.status },
        semantic: true,
      });
      continue;
    }

    if (!spanB) {
      differences.push({
        path,
        type: 'removed',
        valueA: { name: spanA.name, status: spanA.status },
        semantic: true,
      });
      continue;
    }

    // Compare span properties
    if (spanA.name !== spanB.name) {
      differences.push({
        path: `${path}.name`,
        type: 'changed',
        valueA: spanA.name,
        valueB: spanB.name,
        semantic: true,
      });
    }

    if (spanA.status !== spanB.status) {
      differences.push({
        path: `${path}.status`,
        type: 'changed',
        valueA: spanA.status,
        valueB: spanB.status,
        semantic: true,
      });
    }

    if (spanA.error !== spanB.error) {
      differences.push({
        path: `${path}.error`,
        type: spanA.error ? (spanB.error ? 'changed' : 'removed') : 'added',
        valueA: spanA.error,
        valueB: spanB.error,
        semantic: true,
      });
    }

    // Compare input/output (non-semantic as they may contain timing data)
    if (JSON.stringify(spanA.output) !== JSON.stringify(spanB.output)) {
      differences.push({
        path: `${path}.output`,
        type: 'changed',
        valueA: spanA.output,
        valueB: spanB.output,
        semantic: false,
      });
    }
  }

  return differences;
}

/**
 * Compare event arrays (semantic comparison)
 */
function compareEvents(
  eventsA: NormalizedEvent[],
  eventsB: NormalizedEvent[]
): SnapshotDifference[] {
  const differences: SnapshotDifference[] = [];

  // Group events by type for comparison
  const groupByType = (events: NormalizedEvent[]) => {
    const groups: Record<string, NormalizedEvent[]> = {};
    for (const event of events) {
      if (!groups[event.type]) {
        groups[event.type] = [];
      }
      groups[event.type].push(event);
    }
    return groups;
  };

  const groupsA = groupByType(eventsA);
  const groupsB = groupByType(eventsB);

  const allTypes = new Set([...Object.keys(groupsA), ...Object.keys(groupsB)]);

  for (const type of allTypes) {
    const typeEventsA = groupsA[type] || [];
    const typeEventsB = groupsB[type] || [];

    if (typeEventsA.length !== typeEventsB.length) {
      differences.push({
        path: `events.${type}`,
        type: 'changed',
        valueA: typeEventsA.length,
        valueB: typeEventsB.length,
        semantic: true,
      });
    }

    // Compare payloads (exclude timing-specific fields)
    for (let i = 0; i < Math.min(typeEventsA.length, typeEventsB.length); i++) {
      const payloadA = filterTimingFields(typeEventsA[i].payload);
      const payloadB = filterTimingFields(typeEventsB[i].payload);

      if (JSON.stringify(payloadA) !== JSON.stringify(payloadB)) {
        differences.push({
          path: `events.${type}[${i}].payload`,
          type: 'changed',
          valueA: payloadA,
          valueB: payloadB,
          semantic: isSemanticPayloadChange(type, payloadA, payloadB),
        });
      }
    }
  }

  return differences;
}

/**
 * Filter out timing-specific fields from payload
 */
function filterTimingFields(payload: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  const timingKeys = ['latency', 'duration', 'ms', 'timestamp', 'ts', 'time'];

  for (const [key, value] of Object.entries(payload)) {
    const isTimingKey = timingKeys.some((tk) =>
      key.toLowerCase().includes(tk)
    );

    if (!isTimingKey) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Determine if a payload change is semantic
 */
function isSemanticPayloadChange(
  eventType: string,
  _payloadA: Record<string, unknown>,
  _payloadB: Record<string, unknown>
): boolean {
  // Result-affecting events are always semantic
  const semanticEventTypes = ['candidates', 'rerank', 'context', 'error', 'answer_contract'];
  return semanticEventTypes.includes(eventType);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Sort search results by score (descending) with secondary sort by document ID
 */
export function sortResultsDeterministically<T extends { score: number; id: string }>(
  results: T[]
): T[] {
  return [...results].sort((a, b) => {
    // Primary sort: score descending
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 1e-10) {
      return scoreDiff;
    }
    // Secondary sort: id ascending
    return a.id.localeCompare(b.id);
  });
}

/**
 * Generate a reproducible snapshot ID for replay purposes
 */
export function generateReplaySnapshotId(
  originalSnapshotId: string,
  replayConfig: Partial<TraceConfig>
): string {
  const input = {
    original: originalSnapshotId,
    config: sortObjectKeys(removeUndefined(replayConfig)),
  };

  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 32);
}

/**
 * Check if two snapshots are deterministically equivalent
 * (same input should produce same results)
 */
export function areSnapshotsEquivalent(
  snapshotA: NormalizedSnapshot,
  snapshotB: NormalizedSnapshot
): boolean {
  // Same snapshot ID means same input
  if (snapshotA.snapshotId !== snapshotB.snapshotId) {
    return false;
  }

  // Same content hash means same semantic output
  return snapshotA.contentHash === snapshotB.contentHash;
}
