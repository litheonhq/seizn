import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
import { logServerWarn } from '@/lib/server/logger';

export type CanonLockScope = 'never_say' | 'always_say' | 'must_not_know' | 'must_know';
export type CanonSeverity = 'hard' | 'soft';

export interface CanonLock {
  id: string;
  studioId: string;
  npcId: string | null;
  scope: CanonLockScope;
  statement: string;
  regexFastpath: string | null;
  severity: CanonSeverity;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CanonViolationVerdict {
  violates: boolean;
  which_lock_id: string | null;
  excerpt: string | null;
  reason: string | null;
  checked_by: 'regex' | 'llm' | 'unavailable';
}

export type CanonValidationResult =
  | { ok: true; verdict: CanonViolationVerdict }
  | { ok: false; violation: CanonLock; verdict: CanonViolationVerdict };

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CANON_MODEL = 'claude-haiku-4-5-20251001';

function baseVerdict(checkedBy: CanonViolationVerdict['checked_by']): CanonViolationVerdict {
  return {
    violates: false,
    which_lock_id: null,
    excerpt: null,
    reason: null,
    checked_by: checkedBy,
  };
}

function regexViolation(lock: CanonLock, content: string): CanonViolationVerdict | null {
  if (!lock.regexFastpath) return null;
  try {
    const regex = new RegExp(lock.regexFastpath, 'i');
    const match = content.match(regex);
    if (!match) return null;
    return {
      violates: true,
      which_lock_id: lock.id,
      excerpt: match[0].slice(0, 300),
      reason: 'regex_fastpath_matched',
      checked_by: 'regex',
    };
  } catch (error) {
    logServerWarn('[canon/validator] Invalid regex fastpath', error, {
      lockId: lock.id,
    });
    return null;
  }
}

function exactStatementViolation(lock: CanonLock, content: string): CanonViolationVerdict | null {
  if (lock.scope !== 'never_say' && lock.scope !== 'must_not_know') return null;
  const statement = lock.statement.trim();
  if (statement.length < 4) return null;
  if (!content.toLowerCase().includes(statement.toLowerCase())) return null;
  return {
    violates: true,
    which_lock_id: lock.id,
    excerpt: statement.slice(0, 300),
    reason: 'statement_text_matched',
    checked_by: 'regex',
  };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function normalizeLlmVerdict(raw: Record<string, unknown>): CanonViolationVerdict {
  const violates = raw.violates === true;
  return {
    violates,
    which_lock_id: typeof raw.which_lock_id === 'string' ? raw.which_lock_id : null,
    excerpt: typeof raw.excerpt === 'string' ? raw.excerpt.slice(0, 500) : null,
    reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 500) : null,
    checked_by: 'llm',
  };
}

async function llmValidate(content: string, locks: CanonLock[]): Promise<CanonViolationVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.SEIZN_CANON_LLM_DISABLED === 'true') {
    return baseVerdict('unavailable');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model: CANON_MODEL,
      max_tokens: 300,
      temperature: 0,
      system:
        'You are Seizn Canon Lock. Decide whether a proposed NPC memory violates any canon lock. Return JSON only: {"violates": boolean, "which_lock_id": string|null, "excerpt": string|null, "reason": string|null}. Treat hard and soft locks the same for detection; the application enforces severity.',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            canon_locks: locks.map((lock) => ({
              id: lock.id,
              npc_id: lock.npcId,
              scope: lock.scope,
              statement: lock.statement,
            })),
            proposed_memory: content.slice(0, 6000),
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`canon_llm_failed:${response.status}`);
  }

  const data = await response.json();
  const text = typeof data.content?.[0]?.text === 'string' ? data.content[0].text : '';
  const parsed = extractJsonObject(text);
  return parsed ? normalizeLlmVerdict(parsed) : baseVerdict('llm');
}

export async function validateCanonContent(params: {
  content: string;
  locks: CanonLock[];
}): Promise<CanonValidationResult> {
  const activeLocks = params.locks.filter((lock) => lock.active);
  if (activeLocks.length === 0) {
    return { ok: true, verdict: baseVerdict('regex') };
  }

  for (const lock of activeLocks) {
    const verdict = regexViolation(lock, params.content) || exactStatementViolation(lock, params.content);
    if (verdict) return { ok: false, violation: lock, verdict };
  }

  const llmVerdict = await llmValidate(params.content, activeLocks);
  if (!llmVerdict.violates || !llmVerdict.which_lock_id) {
    return { ok: true, verdict: llmVerdict };
  }

  const lock = activeLocks.find((item) => item.id === llmVerdict.which_lock_id);
  if (!lock) {
    return { ok: true, verdict: llmVerdict };
  }

  return { ok: false, violation: lock, verdict: llmVerdict };
}
