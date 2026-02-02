/**
 * Review Token 유틸리티
 * Edge Runtime 호환 (Web Crypto API 사용)
 */

const TOKEN_SECRET = process.env.REVIEW_TOKEN_SECRET || 'seizn-token-secret-2025';

/**
 * HMAC-SHA256 서명 생성 (Edge 호환 - Web Crypto API)
 */
async function createSignature(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  // base64url 인코딩
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * 토큰 페이로드 타입
 */
export interface ReviewTokenPayload {
  exp: number; // 만료 시간 (Unix timestamp ms)
  paths: string[]; // 허용된 경로 패턴
  note?: string; // 메모
}

/**
 * 토큰 검증 결과
 */
export interface TokenVerifyResult {
  valid: boolean;
  payload?: ReviewTokenPayload;
  error?: string;
}

/**
 * Base64URL 디코딩
 */
function base64urlDecode(str: string): string {
  // base64url -> base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // 패딩 추가
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * 리뷰 토큰 검증 (Edge Runtime 호환)
 */
export async function verifyReviewToken(token: string): Promise<TokenVerifyResult> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [payloadStr, signature] = parts;

    // 서명 검증
    const expectedSignature = await createSignature(payloadStr, TOKEN_SECRET);

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    // 페이로드 파싱
    const payloadJson = base64urlDecode(payloadStr);
    const payload: ReviewTokenPayload = JSON.parse(payloadJson);

    // 만료 검증
    if (Date.now() > payload.exp) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (e) {
    console.error('Token verification error:', e);
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * 경로가 허용된 경로 패턴과 일치하는지 확인
 */
export function isPathAllowed(pathname: string, allowedPaths: string[]): boolean {
  // 로케일 프리픽스 제거 (예: /ko/dashboard -> /dashboard)
  const normalizedPath = pathname.replace(/^\/(en|ko|ja|zh-hans|zh-hant|es|fr|de|pt-BR|pt-PT|it|ru|ar|hi|vi|th|id|tr|pl|nl|sv|da|nb|fi|cs|uk|he|el|hu|ro|bg|sk|sl|hr|lt|lv|et|ms|tl)(?=\/|$)/, '') || '/';

  return allowedPaths.some((allowed) => {
    // 와일드카드 패턴 지원 (예: /dashboard/*)
    if (allowed.endsWith('/*')) {
      const prefix = allowed.slice(0, -2);
      return normalizedPath.startsWith(prefix);
    }
    // 정확한 매칭
    return normalizedPath === allowed || normalizedPath.startsWith(allowed + '/');
  });
}
