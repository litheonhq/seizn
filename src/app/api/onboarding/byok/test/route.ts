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

export const runtime = 'nodejs';

interface RequestBody {
  provider?: unknown;
  api_key?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
