import { createServerClient } from '@/lib/supabase';
import { logServerWarn } from '@/lib/server/logger';

export type ModerationCategory = 'sexual' | 'violence' | 'pii' | 'hate' | 'self_harm' | 'csam';
export type ModerationAction = 'block' | 'redact' | 'flag';
export type ModerationStatus = 'clean' | 'flagged' | 'redacted' | 'blocked';

export interface ModerationPolicy {
  organizationId: string;
  policyName: string;
  memoryClass: string | null;
  category: ModerationCategory;
  action: ModerationAction;
  threshold: number;
}

export interface ModerationResult {
  status: ModerationStatus;
  scores: Record<ModerationCategory, number>;
  redactedContent?: string;
  triggered?: Array<{ category: ModerationCategory; action: ModerationAction; threshold: number; score: number }>;
}

type SupabaseLike = ReturnType<typeof createServerClient>;

export const DEFAULT_MODERATION_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';
export const MODERATION_CATEGORIES: ModerationCategory[] = ['sexual', 'violence', 'pii', 'hate', 'self_harm', 'csam'];
export const MODERATION_ACTIONS: ModerationAction[] = ['block', 'redact', 'flag'];

const GLOBAL_MEMORY_CLASS = '*';
const ACTION_RANK: Record<ModerationAction, number> = { flag: 1, redact: 2, block: 3 };

const DEFAULT_POLICIES: Array<Omit<ModerationPolicy, 'organizationId'>> = [
  { policyName: 'default', memoryClass: null, category: 'csam', action: 'block', threshold: 0.01 },
  { policyName: 'default', memoryClass: null, category: 'pii', action: 'redact', threshold: 0.5 },
  { policyName: 'default', memoryClass: null, category: 'hate', action: 'flag', threshold: 0.8 },
  { policyName: 'default', memoryClass: null, category: 'sexual', action: 'flag', threshold: 0.8 },
  { policyName: 'default', memoryClass: null, category: 'violence', action: 'flag', threshold: 0.85 },
  { policyName: 'default', memoryClass: null, category: 'self_harm', action: 'flag', threshold: 0.75 },
];

export class ModerationError extends Error {
  readonly result: ModerationResult;

  constructor(result: ModerationResult) {
    super('Memory blocked by moderation policy');
    this.name = 'ModerationError';
    this.result = result;
  }
}

export function isModerationEnabled(): boolean {
  return process.env.SEIZN_FEATURE_MODERATION === 'true';
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function blankScores(): Record<ModerationCategory, number> {
  return {
    sexual: 0,
    violence: 0,
    pii: 0,
    hate: 0,
    self_harm: 0,
    csam: 0,
  };
}

export function localModerationScores(content: string): Record<ModerationCategory, number> {
  const text = content.toLowerCase();
  const scores = blankScores();

  if (/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(content) || /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(content)) {
    scores.pii = 0.92;
  }
  if (/\b(kill|murder|stab|bomb|blood)\b/.test(text)) {
    scores.violence = 0.82;
  }
  if (/\b(sex|explicit|nude)\b/.test(text)) {
    scores.sexual = 0.86;
  }
  if (/\b(hate group|dehumanize|racial insult)\b/.test(text)) {
    scores.hate = 0.88;
  }
  if (/\b(self harm|suicide|hurt myself)\b/.test(text)) {
    scores.self_harm = 0.9;
  }
  if (/\b(child|minor)\b/.test(text) && scores.sexual > 0) {
    scores.csam = 0.99;
  }

  return scores;
}

function redactContent(content: string, scores: Record<ModerationCategory, number>): string {
  let redacted = content;
  if (scores.pii > 0) {
    redacted = redacted
      .replace(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[redacted-email]')
      .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[redacted-phone]');
  }
  if (redacted === content) {
    redacted = '[redacted by memory moderation policy]';
  }
  return redacted;
}

function normalizePolicy(row: Record<string, unknown>): ModerationPolicy {
  const memoryClass =
    typeof row.memory_class === 'string' && row.memory_class !== GLOBAL_MEMORY_CLASS
      ? row.memory_class
      : null;

  return {
    organizationId: String(row.organization_id),
    policyName: String(row.policy_name),
    memoryClass,
    category: MODERATION_CATEGORIES.includes(row.category as ModerationCategory)
      ? (row.category as ModerationCategory)
      : 'pii',
    action:
      row.action === 'block' || row.action === 'redact' || row.action === 'flag'
        ? row.action
        : 'flag',
    threshold: clamp(Number(row.threshold) || 0),
  };
}

export function evaluateModeration(
  content: string,
  policies: ModerationPolicy[],
  opts: { memoryClass?: string | null; scores?: Record<ModerationCategory, number> } = {}
): ModerationResult {
  const scores = opts.scores || localModerationScores(content);
  const applicable = policies.filter(
    (policy) => !policy.memoryClass || policy.memoryClass === opts.memoryClass
  );
  const triggered = applicable
    .filter((policy) => scores[policy.category] >= policy.threshold)
    .map((policy) => ({
      category: policy.category,
      action: policy.action,
      threshold: policy.threshold,
      score: scores[policy.category],
    }));

  if (triggered.length === 0) {
    return { status: 'clean', scores, triggered };
  }

  const strongest = triggered.reduce((best, item) =>
    ACTION_RANK[item.action] > ACTION_RANK[best.action] ? item : best
  );

  if (strongest.action === 'block') return { status: 'blocked', scores, triggered };
  if (strongest.action === 'redact') {
    return { status: 'redacted', scores, redactedContent: redactContent(content, scores), triggered };
  }
  return { status: 'flagged', scores, triggered };
}

async function loadPolicies(
  supabase: SupabaseLike,
  organizationId: string
): Promise<ModerationPolicy[]> {
  const { data, error } = await supabase
    .from('moderation_policies')
    .select('organization_id, policy_name, memory_class, category, action, threshold')
    .eq('organization_id', organizationId);

  if (error) {
    logServerWarn('[moderation/guard] Policy list unavailable; using defaults', error, { organizationId });
    return DEFAULT_POLICIES.map((policy) => ({ ...policy, organizationId }));
  }

  if (!data || data.length === 0) {
    return DEFAULT_POLICIES.map((policy) => ({ ...policy, organizationId }));
  }

  return (data as Record<string, unknown>[]).map(normalizePolicy);
}

async function providerScores(content: string): Promise<Record<ModerationCategory, number>> {
  const provider = process.env.SEIZN_MODERATION_PROVIDER || 'openai';
  if (provider !== 'openai' || !process.env.OPENAI_API_KEY) {
    return localModerationScores(content);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: content }),
    });
    if (!response.ok) return localModerationScores(content);
    const data = await response.json();
    const raw = data?.results?.[0]?.category_scores || {};
    return {
      sexual: clamp(Number(raw.sexual) || 0),
      violence: clamp(Number(raw.violence) || 0),
      pii: localModerationScores(content).pii,
      hate: clamp(Number(raw.hate) || 0),
      self_harm: clamp(Number(raw.self_harm ?? raw['self-harm']) || 0),
      csam: clamp(Number(raw['sexual/minors']) || 0),
    };
  } catch {
    return localModerationScores(content);
  }
}

export async function moderate(params: {
  organizationId: string;
  memoryClass?: string | null;
  content: string;
  supabase?: SupabaseLike;
}): Promise<ModerationResult> {
  const supabase = params.supabase || createServerClient();
  const [policies, scores] = await Promise.all([
    loadPolicies(supabase, params.organizationId),
    providerScores(params.content),
  ]);
  const result = evaluateModeration(params.content, policies, {
    memoryClass: params.memoryClass,
    scores,
  });
  if (result.status === 'blocked') {
    throw new ModerationError(result);
  }
  return result;
}

export async function resolveModerationOrganizationId(
  supabase: SupabaseLike,
  ctx: { userId: string; keyId?: string | null }
): Promise<string | null> {
  if (ctx.keyId) {
    const { data: keyRow, error } = await supabase
      .from('api_keys')
      .select('organization_id')
      .eq('id', ctx.keyId)
      .maybeSingle();
    if (!error && keyRow?.organization_id) return String(keyRow.organization_id);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', ctx.userId)
    .maybeSingle();
  if (!profileError && profile?.organization_id) return String(profile.organization_id);

  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!memberError && member?.organization_id) return String(member.organization_id);

  return null;
}

export async function listModerationPolicies(
  organizationId: string,
  supabase: SupabaseLike = createServerClient()
): Promise<ModerationPolicy[]> {
  return loadPolicies(supabase, organizationId);
}

export async function upsertModerationPolicy(
  organizationId: string,
  policy: Omit<ModerationPolicy, 'organizationId'>,
  supabase: SupabaseLike = createServerClient()
): Promise<ModerationPolicy> {
  const { data, error } = await supabase
    .from('moderation_policies')
    .upsert(
      {
        organization_id: organizationId,
        policy_name: policy.policyName,
        memory_class: policy.memoryClass || GLOBAL_MEMORY_CLASS,
        category: policy.category,
        action: policy.action,
        threshold: policy.threshold,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,policy_name,memory_class,category' }
    )
    .select('organization_id, policy_name, memory_class, category, action, threshold')
    .single();

  if (error || !data) {
    throw new Error(`moderation_policy_upsert_failed: ${error?.message || 'unknown'}`);
  }

  return normalizePolicy(data as Record<string, unknown>);
}

export type ModeratedMemory<T> = T & {
  moderation_status?: ModerationStatus;
  moderation_scores?: Record<ModerationCategory, number>;
};

export async function moderateRecallResults<
  T extends { content?: unknown; memory_class?: unknown; memory_type?: unknown }
>(
  organizationId: string,
  memories: T[],
  supabase: SupabaseLike = createServerClient()
): Promise<Array<ModeratedMemory<T>>> {
  if (!isModerationEnabled()) return memories;
  const output: Array<ModeratedMemory<T>> = [];

  for (const memory of memories) {
    const content = typeof memory.content === 'string' ? memory.content : '';
    const memoryClass =
      typeof memory.memory_class === 'string'
        ? memory.memory_class
        : typeof memory.memory_type === 'string'
          ? memory.memory_type
          : null;
    try {
      const result = await moderate({ organizationId, memoryClass, content, supabase });
      if (result.status === 'redacted' && result.redactedContent) {
        output.push({ ...memory, content: result.redactedContent, moderation_status: 'redacted', moderation_scores: result.scores });
      } else {
        output.push({ ...memory, moderation_status: result.status, moderation_scores: result.scores });
      }
    } catch (error) {
      if (error instanceof ModerationError) continue;
      output.push(memory);
    }
  }

  return output;
}
