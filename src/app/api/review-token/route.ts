import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// 관리자 시크릿 (환경 변수에서 가져오거나 기본값 사용)
const ADMIN_SECRET = process.env.REVIEW_ADMIN_SECRET || 'seizn-review-admin-2025';
// 토큰 서명용 시크릿
const TOKEN_SECRET = process.env.REVIEW_TOKEN_SECRET || 'seizn-token-secret-2025';

/**
 * 자체 검증 가능한 토큰 생성 (JWT-like)
 * 형식: base64(payload).signature
 */
function createSignedToken(payload: {
  exp: number; // 만료 시간 (Unix timestamp)
  paths: string[]; // 허용된 경로
  note?: string;
}): string {
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payloadStr)
    .digest('base64url');
  return `${payloadStr}.${signature}`;
}

/**
 * 토큰 검증 및 페이로드 추출 (Node.js용 - API Route에서만 사용)
 */
function verifyToken(token: string): {
  valid: boolean;
  payload?: { exp: number; paths: string[]; note?: string };
  error?: string;
} {
  try {
    const [payloadStr, signature] = token.split('.');
    if (!payloadStr || !signature) {
      return { valid: false, error: 'Invalid token format' };
    }

    // 서명 검증
    const expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(payloadStr)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    // 페이로드 파싱
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString());

    // 만료 검증
    if (Date.now() > payload.exp) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * POST: 새 리뷰 토큰 생성 (관리자 전용)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminSecret, expiresInHours = 24, allowedPaths = ['/dashboard'], note } = body;

    // 관리자 인증
    if (adminSecret !== ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 만료 시간 계산
    const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;

    // 자체 검증 토큰 생성
    const token = createSignedToken({
      exp: expiresAt,
      paths: allowedPaths,
      note,
    });

    // 리뷰 URL 생성
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

/**
 * GET: 토큰 검증
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ valid: false, error: 'Token required' }, { status: 400 });
  }

  const result = verifyToken(token);

  if (!result.valid) {
    return NextResponse.json({ valid: false, error: result.error }, { status: 401 });
  }

  return NextResponse.json({
    valid: true,
    allowedPaths: result.payload?.paths,
    expiresAt: new Date(result.payload!.exp).toISOString(),
  });
}

/**
 * DELETE: 토큰 무효화 안내
 * 자체 검증 토큰은 서버에서 무효화할 수 없음
 * 시크릿을 변경하거나 만료를 기다려야 함
 */
export async function DELETE(request: NextRequest) {
  const { adminSecret } = await request.json();

  if (adminSecret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: false,
    message: 'Self-validating tokens cannot be revoked. Change REVIEW_TOKEN_SECRET env var to invalidate all tokens, or wait for expiration.',
  });
}
