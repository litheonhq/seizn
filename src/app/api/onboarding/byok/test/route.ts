/**
 * BYOK setup wizard — key validation endpoint.
 *
 * Locked 2026-05-07. Verifies a user-supplied Anthropic or OpenAI key by
 * making a tiny API call (~$0.001). Used by /onboarding/byok step 3 before
 * the key is persisted via /api/account/byok.
 *
 * Returns:
 *   200 { valid: true,  cost_estimate_usd: number, model: string }
 *   200 { valid: false, error: string, hint?: string }
 *   400 on missing/malformed input
 *   401 if the user isn't signed in
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { verifyCsrfToken } from '@/lib/csrf';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';

export const runtime = 'nodejs';

interface RequestBody {
  provider?: unknown;
  api_key?: unknown;
}

const PER_USER_HOURLY_LIMIT = 10;

// Audit follow-up: prefix-validate before any outbound call so we don't
// turn this endpoint into a key-enumeration oracle. Anthropic uses
// `sk-ant-`, OpenAI uses `sk-proj-` (project-scoped) or `sk-` (legacy).
// Strict character set bans \r\n header-injection vectors.
const KEY_PREFIX_BY_PROVIDER: Record<'anthropic' | 'openai', RegExp> = {
  anthropic: /^sk-ant-[A-Za-z0-9_\-]{20,}$/,
  openai: /^sk-(?:proj-)?[A-Za-z0-9_\-]{20,}$/,
};

async function checkPerUserRateLimit(userId: string): Promise<boolean> {
  // funnel_events double-duty as a generic per-user counter. Within the
  // last hour, count this specific event_type. PR cap is 10/hour to
  // bound key-enumeration throughput while still letting honest users
  // retry typos.
  if (!hasServerSupabaseServiceRoleConfig()) return true;
  const supabase = createServerClient();
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('funnel_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'byok_test_attempt')
    .gte('occurred_at', sinceIso);
  return (count ?? 0) < PER_USER_HOURLY_LIMIT;
}

async function recordByokTestAttempt(userId: string, provider: string): Promise<void> {
  if (!hasServerSupabaseServiceRoleConfig()) return;
  const supabase = createServerClient();
  await supabase.from('funnel_events').insert({
    user_id: userId,
    event_type: 'byok_test_attempt',
    metadata: { provider },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfErr = verifyCsrfToken(request);
  if (csrfErr) return csrfErr;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!(await checkPerUserRateLimit(session.user.id))) {
    return NextResponse.json(
      {
        valid: false,
        error: `Too many key tests this hour (limit ${PER_USER_HOURLY_LIMIT}). Try again later.`,
      },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
  const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';

  if (provider !== 'anthropic' && provider !== 'openai') {
    return NextResponse.json(
      { error: 'provider must be "anthropic" or "openai"' },
      { status: 400 },
    );
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 });
  }
  if (apiKey.length < 20 || apiKey.length > 500) {
    return NextResponse.json(
      { valid: false, error: 'API key length looks invalid' },
      { status: 200 },
    );
  }
  // Strict prefix + character-set validation. Rejects keys not matching
  // the provider's known shape — also blocks CRLF / control-char header
  // injection because the regex is [A-Za-z0-9_-] only.
  if (!KEY_PREFIX_BY_PROVIDER[provider].test(apiKey)) {
    await recordByokTestAttempt(session.user.id, provider);
    return NextResponse.json(
      {
        valid: false,
        error:
          provider === 'anthropic'
            ? 'Anthropic keys must start with sk-ant- and contain only letters, digits, hyphens, underscores.'
            : 'OpenAI keys must start with sk- (or sk-proj-) and contain only letters, digits, hyphens, underscores.',
      },
      { status: 200 },
    );
  }
  await recordByokTestAttempt(session.user.id, provider);

  try {
    if (provider === 'anthropic') {
      return await validateAnthropicKey(apiKey);
    }
    return await validateOpenAIKey(apiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return NextResponse.json(
      { valid: false, error: message },
      { status: 200 },
    );
  }
}

async function validateAnthropicKey(apiKey: string): Promise<NextResponse> {
  // Use the cheapest endpoint that requires a real key: count_tokens.
  // Costs $0 (no model invocation), only validates the key works.
  const response = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'ping' }],
    }),
  });

  if (response.status === 401 || response.status === 403) {
    return NextResponse.json(
      {
        valid: false,
        error: 'Anthropic rejected the key (401/403). Check that the key is correct and active.',
        hint: 'console.anthropic.com/settings/keys',
      },
      { status: 200 },
    );
  }
  if (response.status === 404) {
    // count_tokens not available on this account tier — fall back to a tiny messages call.
    return await pingAnthropicMessages(apiKey);
  }
  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      {
        valid: false,
        error: `Anthropic returned ${response.status}: ${text.slice(0, 200)}`,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    valid: true,
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    cost_estimate_usd: 0,
    message: 'Key verified. You can now use Author Memory v3 with Anthropic Claude.',
  });
}

async function pingAnthropicMessages(apiKey: string): Promise<NextResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });

  if (response.status === 401 || response.status === 403) {
    return NextResponse.json(
      {
        valid: false,
        error: 'Anthropic rejected the key (401/403).',
        hint: 'console.anthropic.com/settings/keys',
      },
      { status: 200 },
    );
  }
  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { valid: false, error: `Anthropic returned ${response.status}: ${text.slice(0, 200)}` },
      { status: 200 },
    );
  }
  return NextResponse.json({
    valid: true,
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    cost_estimate_usd: 0.001,
    message: 'Key verified.',
  });
}

async function validateOpenAIKey(apiKey: string): Promise<NextResponse> {
  // models.list is free and validates the key.
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    return NextResponse.json(
      {
        valid: false,
        error: 'OpenAI rejected the key (401/403). Check that the key is correct and active.',
        hint: 'platform.openai.com/api-keys',
      },
      { status: 200 },
    );
  }
  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { valid: false, error: `OpenAI returned ${response.status}: ${text.slice(0, 200)}` },
      { status: 200 },
    );
  }

  return NextResponse.json({
    valid: true,
    provider: 'openai',
    model: 'gpt-5.5',
    cost_estimate_usd: 0,
    message: 'Key verified. You can now use Author Memory v3 with OpenAI GPT-5.5.',
  });
}
