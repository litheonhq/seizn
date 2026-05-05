import { randomBytes } from 'node:crypto';
import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
import { sendEmail } from '@/lib/email';
import { getPlan } from '@/lib/plan-limits';
import { logServerError, logServerWarn } from '@/lib/server/logger';
import { calculateOverageForecast, type UsageDimension } from '@/lib/stripe-metered';
import { createServerClient } from '@/lib/supabase';
import { createStoryHealthChartPng } from './chart-png';
import { buildPostMortemPdf } from './pdf';
import type {
  PostMortemCanonViolation,
  PostMortemChaosFinding,
  PostMortemCreditUsage,
  PostMortemReportPayload,
  PostMortemReportRecord,
  PostMortemReplaySummary,
  PostMortemStatus,
  PostMortemStoryPoint,
  PostMortemUsageSummary,
} from './types';

type SupabaseLike = ReturnType<typeof createServerClient>;
type Row = Record<string, unknown>;

interface GeneratePostMortemInput {
  studioId: string;
  userId: string;
  title?: string | null;
  notifyEmail?: string | null;
  windowStart?: Date | null;
  windowEnd?: Date | null;
  supabase?: SupabaseLike;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const POST_MORTEM_MODEL = 'claude-haiku-4-5-20251001';
const REPORT_BUCKET = 'post-mortems';

function asRows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((item): item is Row => item !== null && typeof item === 'object' && !Array.isArray(item))
    : [];
}

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

function asStatus(value: unknown): PostMortemStatus {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed'
    ? value
    : 'queued';
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function defaultPayload(): PostMortemReportPayload {
  return {
    generatedAt: '',
    windowStart: '',
    windowEnd: '',
    replayCount: 0,
    canonViolations: [],
    chaosFindings: [],
    storyHealth: [],
    usage: [],
    creditUsage: {
      plan: 'free',
      quarter: '',
      creditsGranted: 0,
      creditsUsed: 0,
      status: 'paid_after_credits',
    },
    replaySamples: [],
  };
}

function normalizePayload(value: unknown): PostMortemReportPayload {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
  const payload = defaultPayload();
  return {
    generatedAt: asString(row.generatedAt, payload.generatedAt),
    windowStart: asString(row.windowStart, payload.windowStart),
    windowEnd: asString(row.windowEnd, payload.windowEnd),
    replayCount: asNumber(row.replayCount, payload.replayCount),
    canonViolations: Array.isArray(row.canonViolations)
      ? (row.canonViolations as PostMortemCanonViolation[])
      : [],
    chaosFindings: Array.isArray(row.chaosFindings)
      ? (row.chaosFindings as PostMortemChaosFinding[])
      : [],
    storyHealth: Array.isArray(row.storyHealth)
      ? (row.storyHealth as PostMortemStoryPoint[])
      : [],
    usage: Array.isArray(row.usage)
      ? (row.usage as PostMortemUsageSummary[])
      : [],
    creditUsage:
      row.creditUsage && typeof row.creditUsage === 'object' && !Array.isArray(row.creditUsage)
        ? normalizeCreditUsage(row.creditUsage as Row, payload.creditUsage)
        : payload.creditUsage,
    replaySamples: Array.isArray(row.replaySamples)
      ? (row.replaySamples as PostMortemReplaySummary[])
      : [],
  };
}

function normalizeCreditUsage(row: Row, fallback: PostMortemCreditUsage): PostMortemCreditUsage {
  const status = row.status === 'included' || row.status === 'unlimited' || row.status === 'paid_after_credits'
    ? row.status
    : fallback.status;
  return {
    plan: asString(row.plan, fallback.plan),
    quarter: asString(row.quarter, fallback.quarter),
    creditsGranted: asNumber(row.creditsGranted, fallback.creditsGranted),
    creditsUsed: asNumber(row.creditsUsed, fallback.creditsUsed),
    status,
  };
}

export function normalizePostMortemReport(row: Row): PostMortemReportRecord {
  return {
    id: asString(row.id),
    studioId: asString(row.studio_id),
    title: asString(row.title, 'Post-mortem report'),
    status: asStatus(row.status),
    windowStart: asString(row.window_start),
    windowEnd: asString(row.window_end),
    publicToken: asString(row.public_token),
    reportPayload: normalizePayload(row.report_payload),
    executiveSummary: asStringArray(row.executive_summary),
    recommendations: asStringArray(row.recommendations),
    storyChartPngBase64: asNullableString(row.story_chart_png_base64),
    pdfStoragePath: asNullableString(row.pdf_storage_path),
    pdfSizeBytes: asNumber(row.pdf_size_bytes),
    notifyEmail: asNullableString(row.notify_email),
    createdBy: asNullableString(row.created_by),
    generatedAt: asNullableString(row.generated_at),
    errorMessage: asNullableString(row.error_message),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function reportWindow(windowStart?: Date | null, windowEnd?: Date | null) {
  const end = windowEnd || new Date();
  const start = windowStart || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function reportTitle(title: string | null | undefined, end: Date) {
  const trimmed = title?.trim();
  return trimmed || `Shipped title post-mortem ${end.toISOString().slice(0, 10)}`;
}

function publicToken() {
  return randomBytes(24).toString('base64url');
}

function quarterStartDate(date: Date) {
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1)).toISOString().slice(0, 10);
}

async function resolveStudioPlan(studioId: string, supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', studioId)
    .maybeSingle();

  if (error) {
    logServerWarn('[post-mortem/report] Studio plan lookup failed', error, { studioId });
  }

  return typeof data?.plan === 'string' && data.plan.trim() ? data.plan : 'free';
}

async function claimPostMortemCredit(params: {
  studioId: string;
  plan: string;
  generatedAt: Date;
  supabase: SupabaseLike;
}): Promise<PostMortemCreditUsage> {
  const quarter = quarterStartDate(params.generatedAt);
  const creditsGranted = getPlan(params.plan).features.postMortemCredits;

  if (creditsGranted === -1) {
    return {
      plan: params.plan,
      quarter,
      creditsGranted,
      creditsUsed: -1,
      status: 'unlimited',
    };
  }

  const { data: ledger, error: ledgerError } = await params.supabase
    .from('post_mortem_credits')
    .upsert(
      {
        studio_id: params.studioId,
        quarter,
        credits_granted: Math.max(creditsGranted, 0),
        plan: params.plan,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'studio_id,quarter' }
    )
    .select('credits_granted, credits_used, plan')
    .single();

  if (ledgerError || !ledger) {
    throw new Error(`post_mortem_credit_ledger_failed: ${ledgerError?.message || 'unknown'}`);
  }

  const granted = asNumber(ledger.credits_granted, Math.max(creditsGranted, 0));
  const used = asNumber(ledger.credits_used, 0);

  if (granted > 0 && used < granted) {
    const nextUsed = used + 1;
    const { error: updateError } = await params.supabase
      .from('post_mortem_credits')
      .update({
        credits_used: nextUsed,
        plan: params.plan,
        updated_at: new Date().toISOString(),
      })
      .eq('studio_id', params.studioId)
      .eq('quarter', quarter)
      .eq('credits_used', used);

    if (updateError) {
      throw new Error(`post_mortem_credit_claim_failed: ${updateError.message}`);
    }

    return {
      plan: params.plan,
      quarter,
      creditsGranted: granted,
      creditsUsed: nextUsed,
      status: 'included',
    };
  }

  return {
    plan: params.plan,
    quarter,
    creditsGranted: granted,
    creditsUsed: used,
    status: 'paid_after_credits',
  };
}

function baseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://www.seizn.com').replace(/\/$/, '');
}

function shareUrl(report: PostMortemReportRecord) {
  return `${baseUrl()}/dashboard/legacy/post-mortem/${report.id}?token=${encodeURIComponent(report.publicToken)}`;
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

function fallbackNarrative(payload: PostMortemReportPayload) {
  const averageConsistency =
    payload.storyHealth.length > 0
      ? payload.storyHealth.reduce((sum, point) => sum + point.consistencyScore, 0) / payload.storyHealth.length
      : 0;
  const canonCount = payload.canonViolations.length;
  const chaosCount = payload.chaosFindings.length;
  return {
    executiveSummary: [
      `The report window contains ${payload.replayCount.toLocaleString()} replay snapshots, ${canonCount} canon violations, and ${chaosCount} chaos findings. Story Health averaged ${Math.round(averageConsistency)} across captured acts.`,
      canonCount > 0
        ? 'Canon drift is the strongest narrative risk. The top violations should be reviewed against lock coverage and replay context before the next content patch.'
        : 'Canon Lock did not surface major violations in this window. Continue sampling replay bundles for regressions around newly shipped scenes.',
      chaosCount > 0
        ? 'Chaos Monkey found adversarial prompts worth triaging. Prioritize critical and high severity findings with replay links before expanding the prompt suite.'
        : 'Chaos Monkey did not surface high-signal issues in the selected window. Keep daily runs active to catch regressions after live balance changes.',
    ],
    recommendations: [
      'Review every hard canon violation and add missing locks for repeated themes.',
      'Open replay traces attached to high severity chaos findings before changing prompts.',
      'Use Story Health acts below 80 consistency as the first QA pass for narrative designers.',
      'Compare overage-producing operations with shipped content milestones.',
      'Regenerate this post-mortem after fixes to confirm trend recovery.',
    ],
  };
}

function normalizeNarrative(raw: Row, fallback: ReturnType<typeof fallbackNarrative>) {
  const summary = asStringArray(raw.executive_summary ?? raw.executiveSummary).slice(0, 3);
  const recommendations = asStringArray(raw.recommendations).slice(0, 5);
  return {
    executiveSummary: summary.length > 0 ? summary : fallback.executiveSummary,
    recommendations: recommendations.length > 0 ? recommendations : fallback.recommendations,
  };
}

async function generateNarrative(payload: PostMortemReportPayload) {
  const fallback = fallbackNarrative(payload);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.SEIZN_POST_MORTEM_LLM_DISABLED === 'true') {
    return fallback;
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: buildAnthropicHeaders(apiKey),
      body: JSON.stringify({
        model: process.env.SEIZN_POST_MORTEM_MODEL || POST_MORTEM_MODEL,
        max_tokens: 900,
        temperature: 0,
        system:
          'You write concise game narrative QA post-mortems for studio leadership. Return JSON only: {"executive_summary": [three paragraph strings], "recommendations": [five bullet strings]}. Be specific about replay, canon, chaos, story health, and overage signals.',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              window_start: payload.windowStart,
              window_end: payload.windowEnd,
              replay_count: payload.replayCount,
              top_canon_violations: payload.canonViolations.slice(0, 10),
              top_chaos_findings: payload.chaosFindings.slice(0, 10),
              story_health: payload.storyHealth.slice(0, 30),
              usage: payload.usage,
            }),
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`post_mortem_llm_failed:${response.status}`);
    const data = await response.json();
    const text = typeof data.content?.[0]?.text === 'string' ? data.content[0].text : '';
    const parsed = extractJsonObject(text);
    return parsed ? normalizeNarrative(parsed, fallback) : fallback;
  } catch (error) {
    logServerWarn('[post-mortem/report] LLM narrative unavailable', error);
    return fallback;
  }
}

function severityRank(value: string) {
  if (value === 'critical') return 4;
  if (value === 'high' || value === 'hard') return 3;
  if (value === 'medium') return 2;
  if (value === 'low' || value === 'soft') return 1;
  return 0;
}

async function collectPayload(
  studioId: string,
  windowStart: Date,
  windowEnd: Date,
  supabase: SupabaseLike
): Promise<PostMortemReportPayload> {
  const start = windowStart.toISOString();
  const end = windowEnd.toISOString();
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const cycleStart = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  const [replays, canon, chaos, story, usage] = await Promise.all([
    supabase
      .from('replay_snapshots')
      .select('trace_id, endpoint, duration_ms, created_at', { count: 'exact' })
      .eq('organization_id', studioId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('canon_violations')
      .select('id, severity, npc_id, session_id, attempted_content, created_at')
      .eq('studio_id', studioId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('chaos_findings')
      .select('id, category, severity, npc_id, prompt, replay_trace_id, created_at')
      .eq('studio_id', studioId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('story_health_snapshots')
      .select('act, snapshot_date, narrative_consistency_score, canon_violation_density, contradiction_rate, engagement_proxy')
      .eq('studio_id', studioId)
      .gte('snapshot_date', startDate)
      .lte('snapshot_date', endDate)
      .order('snapshot_date', { ascending: true })
      .order('act', { ascending: true })
      .limit(500),
    supabase
      .from('usage_aggregates_monthly')
      .select('cycle_start, dimension, total_quantity, stripe_reported_quantity, plan')
      .eq('studio_id', studioId)
      .gte('cycle_start', cycleStart)
      .lte('cycle_start', endDate)
      .order('cycle_start', { ascending: false })
      .limit(24),
  ]);

  for (const [label, result] of Object.entries({ replays, canon, chaos, story, usage })) {
    if (result.error) throw new Error(`post_mortem_${label}_query_failed: ${result.error.message}`);
  }

  const replayRows = asRows(replays.data);
  const canonViolations = asRows(canon.data)
    .map((row): PostMortemCanonViolation => ({
      id: String(row.id),
      severity: asString(row.severity, 'unknown'),
      npcId: asNullableString(row.npc_id),
      sessionId: asNullableString(row.session_id),
      attemptedContent: asString(row.attempted_content).slice(0, 1000),
      createdAt: asString(row.created_at),
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 10);

  const chaosFindings = asRows(chaos.data)
    .map((row): PostMortemChaosFinding => ({
      id: String(row.id),
      category: asString(row.category, 'finding'),
      severity: asString(row.severity, 'medium'),
      npcId: asNullableString(row.npc_id),
      prompt: asString(row.prompt).slice(0, 1000),
      replayTraceId: asNullableString(row.replay_trace_id),
      createdAt: asString(row.created_at),
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 10);

  const storyHealth = asRows(story.data).map((row): PostMortemStoryPoint => ({
    act: asString(row.act, 'global'),
    snapshotDate: asString(row.snapshot_date),
    consistencyScore: asNumber(row.narrative_consistency_score),
    canonDensity: asNumber(row.canon_violation_density),
    contradictionRate: asNumber(row.contradiction_rate),
    engagementProxy: asNumber(row.engagement_proxy),
  }));

  const usageRows = asRows(usage.data)
    .filter((row) => row.dimension === 'memories' || row.dimension === 'ops')
    .map((row): PostMortemUsageSummary => {
      const dimension = row.dimension as UsageDimension;
      const total = asNumber(row.total_quantity);
      const reported = asNumber(row.stripe_reported_quantity);
      const forecast = calculateOverageForecast({
        plan: asString(row.plan, 'free'),
        dimension,
        totalQuantity: total,
        stripeReportedQuantity: reported,
      });
      return {
        dimension,
        plan: asString(row.plan, 'free'),
        cycleStart: asString(row.cycle_start),
        total,
        included: forecast.included,
        billable: forecast.billable,
        reported: forecast.reported,
        forecastCents: forecast.cents,
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    windowStart: start,
    windowEnd: end,
    replayCount: replays.count ?? replayRows.length,
    canonViolations,
    chaosFindings,
    storyHealth,
    usage: usageRows,
    creditUsage: defaultPayload().creditUsage,
    replaySamples: replayRows.slice(0, 25).map((row): PostMortemReplaySummary => ({
      traceId: asString(row.trace_id),
      endpoint: asString(row.endpoint),
      durationMs: asNumber(row.duration_ms),
      createdAt: asString(row.created_at),
    })),
  };
}

async function uploadPdf(
  supabase: SupabaseLike,
  report: PostMortemReportRecord,
  pdfBuffer: Buffer
) {
  const storagePath = `${report.studioId}/${report.id}.pdf`;
  const { error } = await supabase.storage.from(REPORT_BUCKET).upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error(`post_mortem_pdf_upload_failed: ${error.message}`);
  return storagePath;
}

async function notifyReady(report: PostMortemReportRecord) {
  if (!report.notifyEmail) return;
  const url = shareUrl(report);
  const result = await sendEmail({
    to: report.notifyEmail,
    subject: `Seizn post-mortem ready: ${report.title}`,
    html: `<p>Your Seizn post-mortem is ready.</p><p><a href="${url}">Open the live report</a></p>`,
    text: `Your Seizn post-mortem is ready: ${url}`,
  });
  if (!result.success) {
    logServerWarn('[post-mortem/report] Ready email failed', result.error);
  }
}

export async function listPostMortemReports(
  studioId: string,
  supabase: SupabaseLike = createServerClient(),
  limit = 30
) {
  const { data, error } = await supabase
    .from('post_mortem_reports')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) throw new Error(`post_mortem_reports_list_failed: ${error.message}`);
  return asRows(data).map(normalizePostMortemReport);
}

export async function getPostMortemReport(input: {
  id: string;
  studioId?: string | null;
  token?: string | null;
  supabase?: SupabaseLike;
}) {
  const supabase = input.supabase || createServerClient();
  let query = supabase.from('post_mortem_reports').select('*').eq('id', input.id);
  if (input.studioId) {
    query = query.eq('studio_id', input.studioId);
  } else if (input.token) {
    query = query.eq('public_token', input.token);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`post_mortem_report_load_failed: ${error.message}`);
  return data ? normalizePostMortemReport(data as Row) : null;
}

export async function createPostMortemPdfSignedUrl(
  report: PostMortemReportRecord,
  supabase: SupabaseLike = createServerClient(),
  expiresIn = 60 * 60
) {
  if (!report.pdfStoragePath) return null;
  const { data, error } = await supabase.storage
    .from(REPORT_BUCKET)
    .createSignedUrl(report.pdfStoragePath, expiresIn);
  if (error) {
    logServerWarn('[post-mortem/report] PDF signed URL failed', error, {
      reportId: report.id,
    });
    return null;
  }
  return data.signedUrl;
}

export async function generatePostMortemReport(input: GeneratePostMortemInput) {
  const supabase = input.supabase || createServerClient();
  const { start, end } = reportWindow(input.windowStart, input.windowEnd);
  const token = publicToken();
  const title = reportTitle(input.title, end);
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from('post_mortem_reports')
    .insert({
      studio_id: input.studioId,
      title,
      status: 'running',
      window_start: start.toISOString(),
      window_end: end.toISOString(),
      public_token: token,
      notify_email: input.notifyEmail || null,
      created_by: input.userId,
      updated_at: now,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    throw new Error(`post_mortem_report_create_failed: ${insertError?.message || 'unknown'}`);
  }

  const initialReport = normalizePostMortemReport(inserted as Row);

  try {
    const payload = await collectPayload(input.studioId, start, end, supabase);
    const plan = await resolveStudioPlan(input.studioId, supabase);
    const creditUsage = await claimPostMortemCredit({
      studioId: input.studioId,
      plan,
      generatedAt: new Date(),
      supabase,
    });
    const payloadWithCredits: PostMortemReportPayload = {
      ...payload,
      creditUsage,
    };
    const narrative = await generateNarrative(payloadWithCredits);
    const chartPng = createStoryHealthChartPng(payloadWithCredits.storyHealth);
    const reportForPdf: PostMortemReportRecord = {
      ...initialReport,
      status: 'completed',
      reportPayload: payloadWithCredits,
      executiveSummary: narrative.executiveSummary,
      recommendations: narrative.recommendations,
      storyChartPngBase64: chartPng.toString('base64'),
      generatedAt: new Date().toISOString(),
    };
    const pdfBuffer = await buildPostMortemPdf(reportForPdf);
    const storagePath = await uploadPdf(supabase, reportForPdf, pdfBuffer);

    const { data: completed, error: updateError } = await supabase
      .from('post_mortem_reports')
      .update({
        status: 'completed',
        report_payload: payloadWithCredits,
        executive_summary: narrative.executiveSummary,
        recommendations: narrative.recommendations,
        story_chart_png_base64: reportForPdf.storyChartPngBase64,
        pdf_storage_path: storagePath,
        pdf_size_bytes: pdfBuffer.byteLength,
        generated_at: reportForPdf.generatedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', initialReport.id)
      .select('*')
      .single();

    if (updateError || !completed) {
      throw new Error(`post_mortem_report_complete_failed: ${updateError?.message || 'unknown'}`);
    }

    const completedReport = normalizePostMortemReport(completed as Row);
    await notifyReady(completedReport);
    return {
      report: completedReport,
      shareUrl: shareUrl(completedReport),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'post_mortem_generation_failed';
    await supabase
      .from('post_mortem_reports')
      .update({
        status: 'failed',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', initialReport.id);
    logServerError('[post-mortem/report] Generation failed', error, {
      reportId: initialReport.id,
      studioId: input.studioId,
    });
    throw error;
  }
}
