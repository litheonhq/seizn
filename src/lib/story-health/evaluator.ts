import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
import { logServerError, logServerWarn } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';
import { computeRawStoryHealth, normalizeStoryHealthSnapshot } from './metrics';
import type {
  RawStoryHealthActMetrics,
  StoryHealthEvaluationResult,
  StoryHealthSnapshot,
} from './types';

type SupabaseLike = ReturnType<typeof createServerClient>;
type Row = Record<string, unknown>;

interface JudgeResult {
  consistencyScore: number;
  contradictionCount: number;
  notes: string | null;
}

interface EvaluateStoryHealthInput {
  studioId: string;
  windowStart?: Date;
  windowEnd?: Date;
  supabase?: SupabaseLike;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const STORY_HEALTH_MODEL = 'claude-haiku-4-5-20251001';

function asRows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((item): item is Row => item !== null && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.slice(0, 1000) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function extractJsonObject(text: string): Row | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Row;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Row;
    } catch {
      return null;
    }
  }
}

export function getDefaultStoryHealthWindow(now = new Date()) {
  const windowEnd = now;
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
  return { windowStart, windowEnd };
}

function emptyRawAct(): RawStoryHealthActMetrics {
  return {
    act: 'global',
    trustDrift: 0,
    dialogueEntropy: 0,
    canonViolationDensity: 0,
    contradictionRate: 0,
    engagementProxy: 0,
    sessionCount: 0,
    memoryCount: 0,
    canonViolationCount: 0,
    confusionReportCount: 0,
    contradictionCount: 0,
    replayTraceIds: [],
    drilldowns: {},
    replaySamples: [],
  };
}

function heuristicJudge(raw: RawStoryHealthActMetrics): JudgeResult {
  const sparsePenalty = raw.sessionCount === 0 && raw.memoryCount === 0 ? 20 : 0;
  const lowDiversityPenalty = raw.dialogueEntropy > 0 && raw.dialogueEntropy < 25 ? (25 - raw.dialogueEntropy) * 0.35 : 0;
  const penalty =
    sparsePenalty +
    raw.canonViolationDensity * 0.8 +
    raw.contradictionRate * 22 +
    raw.confusionReportCount * 3 +
    Math.abs(raw.trustDrift) * 0.45 +
    lowDiversityPenalty;
  return {
    consistencyScore: round(clamp(100 - penalty, 0, 100)),
    contradictionCount: raw.contradictionCount,
    notes:
      raw.sessionCount === 0
        ? 'No replay sessions in the evaluation window; heuristic score only.'
        : 'Heuristic score from replay, canon, chaos, and bug-report signals.',
  };
}

function normalizeJudgeResult(raw: Row, fallback: JudgeResult): JudgeResult {
  return {
    consistencyScore: round(clamp(asNumber(raw.consistency_score ?? raw.consistencyScore, fallback.consistencyScore), 0, 100)),
    contradictionCount: Math.max(
      0,
      Math.round(asNumber(raw.contradiction_count ?? raw.contradictionCount, fallback.contradictionCount))
    ),
    notes: asNullableString(raw.notes) || fallback.notes,
  };
}

async function llmJudgeAct(raw: RawStoryHealthActMetrics): Promise<JudgeResult> {
  const fallback = heuristicJudge(raw);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.SEIZN_STORY_HEALTH_LLM_DISABLED === 'true') {
    return fallback;
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: buildAnthropicHeaders(apiKey),
      body: JSON.stringify({
        model: process.env.SEIZN_STORY_HEALTH_MODEL || STORY_HEALTH_MODEL,
        max_tokens: 500,
        temperature: 0,
        system:
          'You are Seizn Story Health, an LLM-as-judge for narrative QA. Score whether NPC replay samples remain consistent with themselves and the world state. Return JSON only: {"consistency_score": number 0-100, "contradiction_count": integer, "notes": string}. Penalize canon breaks, self-contradictions, unresolved confusion, and unexplained trust swings.',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              act: raw.act,
              raw_metrics: {
                trust_drift: raw.trustDrift,
                dialogue_entropy: raw.dialogueEntropy,
                canon_violation_density: raw.canonViolationDensity,
                contradiction_rate: raw.contradictionRate,
                engagement_proxy: raw.engagementProxy,
                session_count: raw.sessionCount,
                memory_count: raw.memoryCount,
                confusion_report_count: raw.confusionReportCount,
              },
              replay_samples: raw.replaySamples.slice(0, 10).map((sample) => ({
                trace_id: sample.traceId,
                endpoint: sample.endpoint,
                duration_ms: sample.durationMs,
                text: sample.text.slice(0, 1600),
              })),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`story_health_llm_failed:${response.status}`);
    }

    const data = await response.json();
    const text = typeof data.content?.[0]?.text === 'string' ? data.content[0].text : '';
    const parsed = extractJsonObject(text);
    return parsed ? normalizeJudgeResult(parsed, fallback) : fallback;
  } catch (error) {
    logServerWarn('[story-health/evaluator] LLM judge unavailable', error, {
      act: raw.act,
    });
    return fallback;
  }
}

export async function evaluateStoryHealthForStudio({
  studioId,
  windowStart,
  windowEnd,
  supabase = createServerClient(),
}: EvaluateStoryHealthInput): Promise<StoryHealthEvaluationResult> {
  const defaults = getDefaultStoryHealthWindow();
  const start = windowStart || defaults.windowStart;
  const end = windowEnd || defaults.windowEnd;
  const snapshotDate = toDateOnly(start);
  const rawActs = await computeRawStoryHealth({
    studioId,
    windowStart: start,
    windowEnd: end,
    supabase,
  });
  const acts = rawActs.length > 0 ? rawActs : [emptyRawAct()];

  const rows: Row[] = [];
  for (const raw of acts) {
    const judge = await llmJudgeAct(raw);
    rows.push({
      studio_id: studioId,
      act: raw.act,
      snapshot_date: snapshotDate,
      window_start: start.toISOString(),
      window_end: end.toISOString(),
      trust_drift: raw.trustDrift,
      dialogue_entropy: raw.dialogueEntropy,
      canon_violation_density: raw.canonViolationDensity,
      contradiction_rate:
        raw.sessionCount > 0 ? round(judge.contradictionCount / raw.sessionCount, 4) : raw.contradictionRate,
      engagement_proxy: raw.engagementProxy,
      narrative_consistency_score: judge.consistencyScore,
      session_count: raw.sessionCount,
      memory_count: raw.memoryCount,
      canon_violation_count: raw.canonViolationCount,
      confusion_report_count: raw.confusionReportCount,
      contradiction_count: judge.contradictionCount,
      replay_trace_ids: raw.replayTraceIds,
      drilldowns: raw.drilldowns,
      judge_notes: judge.notes,
      updated_at: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase
    .from('story_health_snapshots')
    .upsert(rows, { onConflict: 'studio_id,act,snapshot_date' })
    .select('*');

  if (error) throw new Error(`story_health_snapshot_upsert_failed: ${error.message}`);

  const { error: refreshError } = await supabase.rpc('refresh_story_health_daily');
  if (refreshError) {
    logServerWarn('[story-health/evaluator] Materialized view refresh failed', refreshError);
  }

  return {
    snapshots: asRows(data).map(normalizeStoryHealthSnapshot),
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
  };
}

export async function evaluateAllStoryHealth(
  supabase: SupabaseLike = createServerClient(),
  now = new Date()
) {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) throw new Error(`story_health_orgs_load_failed: ${error.message}`);

  const { windowStart, windowEnd } = getDefaultStoryHealthWindow(now);
  const results: Array<{ studioId: string; status: 'completed' | 'failed'; snapshots?: number; error?: string }> = [];

  for (const row of asRows(data)) {
    const studioId = typeof row.id === 'string' ? row.id : '';
    if (!studioId) continue;
    try {
      const result = await evaluateStoryHealthForStudio({
        studioId,
        windowStart,
        windowEnd,
        supabase,
      });
      results.push({ studioId, status: 'completed', snapshots: result.snapshots.length });
    } catch (error_) {
      logServerError('[story-health/evaluator] Studio evaluation failed', error_, { studioId });
      results.push({
        studioId,
        status: 'failed',
        error: error_ instanceof Error ? error_.message : 'story_health_failed',
      });
    }
  }

  return {
    checked: asRows(data).length,
    processed: results.length,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    results,
  };
}
