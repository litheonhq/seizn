import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

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

    if (signature !== expectedSignature) {
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
    const secrets = getConfiguredSecrets();
    if (!secrets) {
      return missingSecretResponse();
    }

    const body = await request.json();
    const {
      adminSecret,
      expiresInHours = 24,
      allowedPaths = ['/dashboard'],
      note,
    } = body;

    if (adminSecret !== secrets.adminSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (
      !Array.isArray(allowedPaths) ||
      !allowedPaths.every((path) => typeof path === 'string')
    ) {
      return NextResponse.json(
        { error: 'allowedPaths must be a string array' },
        { status: 400 }
      );
    }

    const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;

    const token = createSignedToken(
      {
        exp: expiresAt,
        paths: allowedPaths,
        note,
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
      expiresInHours,
      allowedPaths,
      note,
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
  const secrets = getConfiguredSecrets();
  if (!secrets) {
    return missingSecretResponse();
  }

  const { adminSecret } = await request.json();

  if (adminSecret !== secrets.adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: false,
    message:
      'Self-validating tokens cannot be revoked. Change REVIEW_TOKEN_SECRET env var to invalidate all tokens, or wait for expiration.',
  });
}
