import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { constantTimeEqual } from '@/lib/security/constant-time';
import { checkCustomRateLimitAsync, getRateLimitHeaders } from '@/lib/rate-limit';

const REVIEW_TOKEN_ADMIN_LIMIT = 8;
const REVIEW_TOKEN_ADMIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_EXPIRES_IN_HOURS = 168;
const MAX_ALLOWED_PATHS = 20;
const MAX_PATH_LENGTH = 128;
const MAX_NOTE_LENGTH = 200;

function getConfiguredSecrets(): { adminSecret: string; tokenSecret: string } | null {
  const adminSecret = process.env.REVIEW_ADMIN_SECRET;
  const tokenSecret = process.env.REVIEW_TOKEN_SECRET;

  if (!adminSecret || !tokenSecret) {
    return null;
  }

  return { adminSecret, tokenSecret };
}

function missingSecretResponse() {
  return NextResponse.json(
    {
      error:
        'Server misconfigured: REVIEW_ADMIN_SECRET and REVIEW_TOKEN_SECRET must be set',
    },
    { status: 500 }
  );
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

async function enforceAdminRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const result = await checkCustomRateLimitAsync(
    `review_token_admin:${getClientIp(request)}`,
    REVIEW_TOKEN_ADMIN_LIMIT,
    REVIEW_TOKEN_ADMIN_WINDOW_MS
  );
  if (result.allowed) return null;

  return NextResponse.json(
    { error: 'Too many review token attempts. Please try again later.' },
    { status: 429, headers: getRateLimitHeaders(result) }
  );
}

function normalizeExpiresInHours(value: unknown): number {
  if (value === undefined || value === null) return 24;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 24;
  return Math.min(Math.floor(numeric), MAX_EXPIRES_IN_HOURS);
}

function normalizeAllowedPaths(value: unknown): string[] | null {
  if (value === undefined || value === null) return ['/dashboard'];
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ALLOWED_PATHS) {
    return null;
  }

  const normalized = value.map((entry) => {
    if (typeof entry !== 'string') return null;
    const path = entry.trim();
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('\\') ||
      /[\u0000-\u001f\u007f]/.test(path) ||
      path.length > MAX_PATH_LENGTH
    ) {
      return null;
    }
    return path;
  });

  if (normalized.some((entry) => !entry)) return null;
  return [...new Set(normalized as string[])];
}

function normalizeNote(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const note = value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH);
  return note || undefined;
}

function createSignedToken(
  payload: { exp: number; paths: string[]; note?: string },
  tokenSecret: string
): string {
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', tokenSecret)
    .update(payloadStr)
    .digest('base64url');

  return `${payloadStr}.${signature}`;
}

function verifyToken(
  token: string,
  tokenSecret: string
): {
  valid: boolean;
  payload?: { exp: number; paths: string[]; note?: string };
  error?: string;
} {
  try {
    const [payloadStr, signature] = token.split('.');
    if (!payloadStr || !signature) {
      return { valid: false, error: 'Invalid token format' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', tokenSecret)
      .update(payloadStr)
      .digest('base64url');

    if (!constantTimeEqual(signature, expectedSignature)) {
      return { valid: false, error: 'Invalid signature' };
    }

    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString());

    if (Date.now() > payload.exp) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Token verification failed' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceAdminRateLimit(request);
    if (rateLimited) return rateLimited;

    const secrets = getConfiguredSecrets();
    if (!secrets) {
      return missingSecretResponse();
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const {
      adminSecret,
      expiresInHours,
      allowedPaths,
      note,
    } = body as Record<string, unknown>;

    if (typeof adminSecret !== 'string' || !constantTimeEqual(adminSecret, secrets.adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const safeAllowedPaths = normalizeAllowedPaths(allowedPaths);
    if (!safeAllowedPaths) {
      return NextResponse.json(
        { error: 'allowedPaths must be an array of relative paths' },
        { status: 400 }
      );
    }

    const safeExpiresInHours = normalizeExpiresInHours(expiresInHours);
    const safeNote = normalizeNote(note);
    const expiresAt = Date.now() + safeExpiresInHours * 60 * 60 * 1000;

    const token = createSignedToken(
      {
        exp: expiresAt,
        paths: safeAllowedPaths,
        ...(safeNote ? { note: safeNote } : {}),
      },
      secrets.tokenSecret
    );

    const baseUrl = process.env.NEXTAUTH_URL || 'https://www.seizn.com';
    const reviewUrl = `${baseUrl}/dashboard?review_token=${encodeURIComponent(token)}`;

    return NextResponse.json({
      success: true,
      token,
      reviewUrl,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInHours: safeExpiresInHours,
      allowedPaths: safeAllowedPaths,
      note: safeNote,
    });
  } catch (error) {
    console.error('Error creating review token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const secrets = getConfiguredSecrets();
  if (!secrets) {
    return missingSecretResponse();
  }

  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ valid: false, error: 'Token required' }, { status: 400 });
  }

  const result = verifyToken(token, secrets.tokenSecret);

  if (!result.valid) {
    return NextResponse.json({ valid: false, error: result.error }, { status: 401 });
  }

  return NextResponse.json({
    valid: true,
    allowedPaths: result.payload?.paths,
    expiresAt: new Date(result.payload!.exp).toISOString(),
  });
}

export async function DELETE(request: NextRequest) {
  const rateLimited = await enforceAdminRateLimit(request);
  if (rateLimited) return rateLimited;

  const secrets = getConfiguredSecrets();
  if (!secrets) {
    return missingSecretResponse();
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { adminSecret } = body as { adminSecret?: unknown };

  if (typeof adminSecret !== 'string' || !constantTimeEqual(adminSecret, secrets.adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: false,
    message:
      'Self-validating tokens cannot be revoked. Change REVIEW_TOKEN_SECRET env var to invalidate all tokens, or wait for expiration.',
  });
}
