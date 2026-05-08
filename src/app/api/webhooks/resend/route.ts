import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';

/**
 * Resend webhook handler (plan W2.5).
 *
 * Resend signs every delivery with Svix-compatible HMAC-SHA256:
 *   header `svix-signature`: `v1,<base64(hmac_sha256(secret, "{id}.{ts}.{body}"))>`
 *   header `svix-id`        : message id
 *   header `svix-timestamp` : unix seconds
 *
 * Verification uses Web Crypto API (no `svix` dep needed) — works on edge or node.
 * Tolerance: 5 minutes on timestamp (replay attack window).
 *
 * On verified event:
 *   - INSERT into resend_webhook_events (PK conflict → 200, idempotent)
 *   - email.bounced / email.complained → INSERT into email_suppression_list
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

async function verifySvixSignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string
): Promise<boolean> {
  const tsNumber = Number(svixTimestamp);
  if (!Number.isFinite(tsNumber)) return false;

  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - tsNumber);
  if (ageSec > SIGNATURE_TOLERANCE_SECONDS) return false;

  // Resend secret format: `whsec_<base64>`. Strip prefix if present.
  const rawSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;

  let secretBytes: ArrayBuffer;
  try {
    const decoded = atob(rawSecret);
    const buf = new ArrayBuffer(decoded.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < decoded.length; i++) view[i] = decoded.charCodeAt(i);
    secretBytes = buf;
  } catch {
    return false;
  }

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // Header may contain multiple comma-separated `v1,<sig>` entries.
  const candidates = svixSignature.split(' ').map((s) => s.trim()).filter(Boolean);
  for (const candidate of candidates) {
    const [version, signed] = candidate.split(',');
    if (version !== 'v1' || !signed) continue;
    if (timingSafeEqual(signed, expectedB64)) {
      return true;
    }
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    subject?: string;
    bounce?: {
      type?: string;
      message?: string;
    };
    [key: string]: unknown;
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    logServerError(
      'RESEND_WEBHOOK_SECRET not configured',
      new Error('Missing RESEND_WEBHOOK_SECRET')
    );
    return NextResponse.json({ error: 'webhook not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'missing svix headers' }, { status: 400 });
  }

  // Read raw body once — needed for signature verification.
  const rawBody = await request.text();

  const valid = await verifySvixSignature(
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature,
    secret
  );
  if (!valid) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Recipient extraction — Resend sends `to` as string or string[].
  const recipientRaw = payload.data.to;
  const recipient = Array.isArray(recipientRaw)
    ? recipientRaw[0]
    : typeof recipientRaw === 'string'
      ? recipientRaw
      : null;

  // Idempotent insert — on PK conflict the event was already processed.
  const { error: insertError } = await supabase.from('resend_webhook_events').insert({
    id: svixId,
    type: payload.type,
    recipient,
    email_id: payload.data.email_id ?? null,
    payload,
  });

  if (insertError && insertError.code !== '23505' /* unique_violation */) {
    logServerError('Resend webhook insert failed', insertError);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  if (insertError?.code === '23505') {
    // Duplicate delivery — already handled.
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  // Side effects on terminal delivery states.
  if (recipient) {
    if (payload.type === 'email.bounced') {
      const bounceType = payload.data.bounce?.type ?? 'unknown';
      const reason = bounceType.toLowerCase().includes('soft') ? 'soft_bounce' : 'hard_bounce';
      await supabase.from('email_suppression_list').upsert(
        {
          email: recipient,
          reason,
          source: 'resend_webhook',
          suppressed_at: new Date().toISOString(),
          // Soft bounces auto-expire after 7 days; hard bounces never.
          expires_at: reason === 'soft_bounce'
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            : null,
        },
        { onConflict: 'email' }
      );
    } else if (payload.type === 'email.complained') {
      // Spam complaint — 30-day cooldown, never auto-recover. Manual review required.
      await supabase.from('email_suppression_list').upsert(
        {
          email: recipient,
          reason: 'complaint',
          source: 'resend_webhook',
          suppressed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'email' }
      );
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
