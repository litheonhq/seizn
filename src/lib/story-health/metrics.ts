import { createServerClient } from '@/lib/supabase';
import { logServerWarn } from '@/lib/server/logger';
import type {
  RawStoryHealthActMetrics,
  StoryHealthDrilldownItem,
  StoryHealthDrilldowns,
  StoryHealthMetricKey,
  StoryHealthReplaySample,
  StoryHealthSnapshot,
} from './types';

type SupabaseLike = ReturnType<typeof createServerClient>;
type Row = Record<string, unknown>;

interface ComputeStoryHealthInput {
  studioId: string;
  windowStart: Date;
  windowEnd: Date;
  supabase?: SupabaseLike;
}

interface MutableActMetrics {
  act: string;
  sessionCount: number;
  durationTotalMs: number;
  trustDeltas: number[];
  texts: string[];
  memoryCount: number;
  canonViolationCount: number;
  confusionReportCount: number;
  contradictionCount: number;
  replayTraceIds: Set<string>;
  drilldowns: StoryHealthDrilldowns;
  replaySamples: StoryHealthReplaySample[];
}

const ACT_KEYS = new Set([
  'act',
  'act_id',
  'actid',
  'story_act',
  'storyact',
  'chapter',
  'chapter_id',
  'chapterid',
  'episode',
  'episode_id',
  'episodeid',
  'quest_act',
  'questact',
]);

const ACT_FALLBACK_KEYS = new Set([
  'scene',
  'scene_id',
  'sceneid',
  'scenario',
  'scenario_id',
  'scenarioid',
  'level',
  'level_id',
  'levelid',
]);

const TEXT_KEYS = new Set([
  'content',
  'text',
  'message',
  'prompt',
  'query',
  'query_text',
  'response',
  'output',
  'actual_output',
  'attempted_content',
  'dialogue',
  'utterance',
  'transcript',
  'summary',
]);

const TRUST_KEYS = new Set([
  'trust_delta',
  'trustdelta',
  'npc_trust_delta',
  'npctrustdelta',
  'player_trust_delta',
  'playertrustdelta',
  'relationship_delta',
  'relationshipdelta',
  'trust_change',
  'trustchange',
  'affinity_delta',
  'affinitydelta',
]);

const TRACE_KEYS = new Set([
  'trace_id',
  'traceid',
  'replay_trace_id',
  'replaytraceid',
  'session_id',
  'sessionid',
]);

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asObject(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((item): item is Row => item !== null && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function normalizeKey(key: string) {
  return key.replace(/[-\s]/g, '').toLowerCase();
}

function normalizeAct(value: unknown) {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 96);
  return cleaned || null;
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getOrCreateAct(groups: Map<string, MutableActMetrics>, act: string) {
  const existing = groups.get(act);
  if (existing) return existing;
  const created: MutableActMetrics = {
    act,
    sessionCount: 0,
    durationTotalMs: 0,
    trustDeltas: [],
    texts: [],
    memoryCount: 0,
    canonViolationCount: 0,
    confusionReportCount: 0,
    contradictionCount: 0,
    replayTraceIds: new Set<string>(),
    drilldowns: {},
    replaySamples: [],
  };
  groups.set(act, created);
  return created;
}

function collectNestedStrings(value: unknown, output: string[], depth = 0) {
  if (depth > 5 || output.length > 120) return;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length >= 4 && !/^[0-9a-f-]{24,}$/i.test(trimmed)) {
      output.push(trimmed.slice(0, 1200));
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) collectNestedStrings(item, output, depth + 1);
    return;
  }

  const row = value as Row;
  for (const [key, nested] of Object.entries(row)) {
    if (TEXT_KEYS.has(normalizeKey(key)) && typeof nested === 'string') {
      collectNestedStrings(nested, output, depth + 1);
      continue;
    }
    if (nested && typeof nested === 'object') collectNestedStrings(nested, output, depth + 1);
  }
}

function collectTrustDeltas(value: unknown, output: number[], depth = 0) {
  if (depth > 5 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) collectTrustDeltas(item, output, depth + 1);
    return;
  }

  const row = value as Row;
  for (const [key, nested] of Object.entries(row)) {
    if (TRUST_KEYS.has(normalizeKey(key))) {
      const delta = asNumber(nested, Number.NaN);
      if (Number.isFinite(delta)) output.push(clamp(delta, -100, 100));
    }
    if (nested && typeof nested === 'object') collectTrustDeltas(nested, output, depth + 1);
  }
}

function findNestedValue(
  value: unknown,
  keys: Set<string>,
  depth = 0
): unknown {
  if (depth > 5 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 30)) {
      const nested = findNestedValue(item, keys, depth + 1);
      if (nested != null) return nested;
    }
    return null;
  }

  const row = value as Row;
  for (const [key, nested] of Object.entries(row)) {
    if (keys.has(normalizeKey(key))) return nested;
  }
  for (const nested of Object.values(row)) {
    const found = findNestedValue(nested, keys, depth + 1);
    if (found != null) return found;
  }
  return null;
}

export function extractActFromPayload(...values: unknown[]) {
  for (const value of values) {
    const direct = normalizeAct(findNestedValue(value, ACT_KEYS));
    if (direct) return direct;
  }
  for (const value of values) {
    const fallback = normalizeAct(findNestedValue(value, ACT_FALLBACK_KEYS));
    if (fallback) return fallback;
  }
  return 'global';
}

export function extractTraceIdFromPayload(...values: unknown[]) {
  for (const value of values) {
    const found = normalizeAct(findNestedValue(value, TRACE_KEYS));
    if (found) return found;
  }
  return null;
}

export function summarizeReplayText(...values: unknown[]) {
  const snippets: string[] = [];
  for (const value of values) collectNestedStrings(value, snippets);
  return snippets.join('\n').slice(0, 8000);
}

export function calculateDialogueEntropy(texts: string[]) {
  const tokens = texts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .slice(0, 8000);

  if (tokens.length < 2) return 0;
  const uniqueBigrams = new Set<string>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    uniqueBigrams.add(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return round((uniqueBigrams.size / tokens.length) * 100);
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pushDrilldown(
  drilldowns: StoryHealthDrilldowns,
  key: StoryHealthMetricKey,
  item: StoryHealthDrilldownItem
) {
  if (!item.traceId) return;
  const current = drilldowns[key] || [];
  if (current.some((existing) => existing.traceId === item.traceId && existing.source === item.source)) {
    return;
  }
  drilldowns[key] = [...current, item].slice(0, 12);
}

async function safeRows(label: string, query: PromiseLike<{ data: unknown; error: { message?: string } | null }>) {
  const { data, error } = await query;
  if (error) {
    logServerWarn(`[story-health/metrics] ${label} query failed`, error);
    return [];
  }
  return asRows(data);
}

export function normalizeStoryHealthSnapshot(row: Row): StoryHealthSnapshot {
  const drilldowns = asObject(row.drilldowns) as StoryHealthDrilldowns;
  return {
    id: asString(row.id),
    studioId: asString(row.studio_id),
    act: asString(row.act, 'global'),
    snapshotDate: asString(row.snapshot_date),
    windowStart: asString(row.window_start),
    windowEnd: asString(row.window_end),
    trustDrift: asNumber(row.trust_drift),
    dialogueEntropy: asNumber(row.dialogue_entropy),
    canonViolationDensity: asNumber(row.canon_violation_density),
    contradictionRate: asNumber(row.contradiction_rate),
    engagementProxy: asNumber(row.engagement_proxy),
    narrativeConsistencyScore: asNumber(row.narrative_consistency_score),
    sessionCount: asNumber(row.session_count),
    memoryCount: asNumber(row.memory_count),
    canonViolationCount: asNumber(row.canon_violation_count),
    confusionReportCount: asNumber(row.confusion_report_count),
    contradictionCount: asNumber(row.contradiction_count),
    replayTraceIds: Array.isArray(row.replay_trace_ids)
      ? row.replay_trace_ids.filter((item): item is string => typeof item === 'string')
      : [],
    drilldowns,
    judgeNotes: asNullableString(row.judge_notes),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export async function listStoryHealthSnapshots(
  studioId: string,
  supabase: SupabaseLike = createServerClient(),
  opts: { limit?: number; act?: string | null } = {}
) {
  let query = supabase
    .from('story_health_snapshots')
    .select('*')
    .eq('studio_id', studioId)
    .order('snapshot_date', { ascending: false })
    .order('act', { ascending: true })
    .limit(Math.min(Math.max(opts.limit ?? 120, 1), 365));

  if (opts.act) query = query.eq('act', opts.act);

  const { data, error } = await query;
  if (error) throw new Error(`story_health_snapshots_list_failed: ${error.message}`);
  return asRows(data).map(normalizeStoryHealthSnapshot);
}

export async function getStoryHealthAct(
  studioId: string,
  act: string,
  supabase: SupabaseLike = createServerClient(),
  limit = 30
) {
  return listStoryHealthSnapshots(studioId, supabase, {
    act,
    limit: Math.min(Math.max(limit, 1), 90),
  });
}

export async function computeRawStoryHealth({
  studioId,
  windowStart,
  windowEnd,
  supabase = createServerClient(),
}: ComputeStoryHealthInput): Promise<RawStoryHealthActMetrics[]> {
  const start = windowStart.toISOString();
  const end = windowEnd.toISOString();
  const groups = new Map<string, MutableActMetrics>();

  const [replayRows, memoryRows, canonRows, chaosRows, exportRows] = await Promise.all([
    safeRows(
      'replay_snapshots',
      supabase
        .from('replay_snapshots')
        .select('trace_id, endpoint, request_body, response_body, memory_reads, memory_writes, tool_calls, duration_ms, created_at')
        .eq('organization_id', studioId)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
        .limit(500)
    ),
    safeRows(
      'memories',
      supabase
        .from('memories')
        .select('id, content, companion_meta, session_id, agent_id, entity_id, created_at')
        .eq('organization_id', studioId)
        .eq('is_deleted', false)
        .gte('created_at', start)
        .lt('created_at', end)
        .limit(1000)
    ),
    safeRows(
      'canon_violations',
      supabase
        .from('canon_violations')
        .select('id, session_id, npc_id, attempted_content, verdict, severity, created_at')
        .eq('studio_id', studioId)
        .gte('created_at', start)
        .lt('created_at', end)
        .limit(500)
    ),
    safeRows(
      'chaos_findings',
      supabase
        .from('chaos_findings')
        .select('id, npc_id, prompt, prompt_category, category, severity, verdict, replay_trace_id, created_at')
        .eq('studio_id', studioId)
        .gte('created_at', start)
        .lt('created_at', end)
        .limit(500)
    ),
    safeRows(
      'replay_bundle_exports',
      supabase
        .from('replay_bundle_exports')
        .select('id, trace_id, provider, external_issue_key, created_at')
        .eq('organization_id', studioId)
        .gte('created_at', start)
        .lt('created_at', end)
        .limit(500)
    ),
  ]);

  const actByTrace = new Map<string, string>();

  for (const row of replayRows) {
    const act = extractActFromPayload(row.request_body, row.response_body, row.memory_reads, row.memory_writes, row.tool_calls);
    const group = getOrCreateAct(groups, act);
    const traceId = asString(row.trace_id);
    const durationMs = Math.max(0, asNumber(row.duration_ms));
    const text = summarizeReplayText(row.request_body, row.response_body, row.memory_reads, row.memory_writes, row.tool_calls);
    const trustDeltas: number[] = [];

    collectTrustDeltas(row.request_body, trustDeltas);
    collectTrustDeltas(row.response_body, trustDeltas);
    collectTrustDeltas(row.memory_reads, trustDeltas);
    collectTrustDeltas(row.memory_writes, trustDeltas);

    group.sessionCount += 1;
    group.durationTotalMs += durationMs;
    group.trustDeltas.push(...trustDeltas);
    if (text) group.texts.push(text);
    if (traceId) {
      group.replayTraceIds.add(traceId);
      actByTrace.set(traceId, act);
      pushDrilldown(group.drilldowns, 'engagement_proxy', {
        traceId,
        label: `Replay ${traceId.slice(0, 8)}`,
        source: 'replay',
        createdAt: asNullableString(row.created_at),
      });
      if (trustDeltas.length > 0) {
        pushDrilldown(group.drilldowns, 'trust_drift', {
          traceId,
          label: `Trust delta ${round(mean(trustDeltas), 2)}`,
          source: 'replay',
          createdAt: asNullableString(row.created_at),
        });
      }
    }
    group.replaySamples.push({
      traceId,
      act,
      endpoint: asNullableString(row.endpoint),
      durationMs,
      text,
      createdAt: asString(row.created_at),
    });
  }

  for (const row of memoryRows) {
    const companionMeta = row.companion_meta;
    const act = extractActFromPayload(companionMeta, row);
    const group = getOrCreateAct(groups, act);
    const content = asString(row.content);
    const traceId = extractTraceIdFromPayload(companionMeta, row);
    const trustDeltas: number[] = [];

    collectTrustDeltas(companionMeta, trustDeltas);
    group.memoryCount += 1;
    group.trustDeltas.push(...trustDeltas);
    if (content) group.texts.push(content);
    if (traceId) {
      group.replayTraceIds.add(traceId);
      pushDrilldown(group.drilldowns, 'dialogue_entropy', {
        traceId,
        label: `Memory ${asString(row.id).slice(0, 8)}`,
        source: 'memory',
        createdAt: asNullableString(row.created_at),
      });
    }
  }

  for (const row of canonRows) {
    const traceId = asNullableString(row.session_id) || extractTraceIdFromPayload(row.verdict);
    const act = (traceId && actByTrace.get(traceId)) || extractActFromPayload(row.verdict, row.attempted_content);
    const group = getOrCreateAct(groups, act);
    group.canonViolationCount += 1;
    if (traceId) {
      group.replayTraceIds.add(traceId);
      pushDrilldown(group.drilldowns, 'canon_violation_density', {
        traceId,
        label: `Canon ${asString(row.severity, 'hit')}`,
        source: 'canon',
        severity: asNullableString(row.severity),
        createdAt: asNullableString(row.created_at),
      });
    }
    const content = asString(row.attempted_content);
    if (content) group.texts.push(content);
  }

  for (const row of chaosRows) {
    const traceId = asNullableString(row.replay_trace_id) || extractTraceIdFromPayload(row.verdict);
    const act = (traceId && actByTrace.get(traceId)) || extractActFromPayload(row.verdict, row.prompt);
    const group = getOrCreateAct(groups, act);
    const category = asString(row.category);
    if (category === 'contradiction_loop') group.contradictionCount += 1;
    if (category === 'dead_end') group.confusionReportCount += 1;
    if (traceId) {
      group.replayTraceIds.add(traceId);
      if (category === 'contradiction_loop') {
        pushDrilldown(group.drilldowns, 'contradiction_rate', {
          traceId,
          label: `Chaos ${asString(row.severity, 'finding')}`,
          source: 'chaos',
          severity: asNullableString(row.severity),
          createdAt: asNullableString(row.created_at),
        });
      }
    }
    const prompt = asString(row.prompt);
    if (prompt) group.texts.push(prompt);
  }

  for (const row of exportRows) {
    const traceId = asString(row.trace_id);
    const act = actByTrace.get(traceId) || 'global';
    const group = getOrCreateAct(groups, act);
    group.confusionReportCount += 1;
    if (traceId) {
      group.replayTraceIds.add(traceId);
      pushDrilldown(group.drilldowns, 'narrative_consistency_score', {
        traceId,
        label: `${asString(row.provider, 'issue')} ${asString(row.external_issue_key, '').trim() || 'export'}`,
        source: 'bug-report',
        createdAt: asNullableString(row.created_at),
      });
    }
  }

  return [...groups.values()]
    .map((group) => {
      const replayTraceIds = [...group.replayTraceIds].slice(0, 50);
      const canonViolationDensity =
        group.memoryCount > 0 ? (group.canonViolationCount / group.memoryCount) * 1000 : 0;
      const contradictionRate =
        group.sessionCount > 0 ? group.contradictionCount / group.sessionCount : 0;
      return {
        act: group.act,
        trustDrift: round(mean(group.trustDeltas)),
        dialogueEntropy: calculateDialogueEntropy(group.texts),
        canonViolationDensity: round(canonViolationDensity),
        contradictionRate: round(contradictionRate),
        engagementProxy: round(group.sessionCount > 0 ? group.durationTotalMs / group.sessionCount / 1000 : 0),
        sessionCount: group.sessionCount,
        memoryCount: group.memoryCount,
        canonViolationCount: group.canonViolationCount,
        confusionReportCount: group.confusionReportCount,
        contradictionCount: group.contradictionCount,
        replayTraceIds,
        drilldowns: group.drilldowns,
        replaySamples: group.replaySamples.slice(0, 20),
      } satisfies RawStoryHealthActMetrics;
    })
    .sort((a, b) => {
      if (a.act === 'global') return 1;
      if (b.act === 'global') return -1;
      return a.act.localeCompare(b.act);
    });
}
