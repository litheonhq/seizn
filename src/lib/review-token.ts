/**
 * Review token utilities (Edge runtime compatible).
 */

function getTokenSecret(): string | null {
  return process.env.REVIEW_TOKEN_SECRET ?? null;
}

/**
 * Generate HMAC-SHA256 signature using Web Crypto API.
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

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface ReviewTokenPayload {
  exp: number;
  paths: string[];
  note?: string;
}

export interface TokenVerifyResult {
  valid: boolean;
  payload?: ReviewTokenPayload;
  error?: string;
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

export async function verifyReviewToken(token: string): Promise<TokenVerifyResult> {
  const tokenSecret = getTokenSecret();
  if (!tokenSecret) {
    return {
      valid: false,
      error:
        'Server misconfigured: REVIEW_TOKEN_SECRET must be set to verify review tokens',
    };
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [payloadStr, signature] = parts;
    const expectedSignature = await createSignature(payloadStr, tokenSecret);

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    const payloadJson = base64urlDecode(payloadStr);
    const payload: ReviewTokenPayload = JSON.parse(payloadJson);

    if (Date.now() > payload.exp) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    console.error('Token verification error:', error);
    return { valid: false, error: 'Token verification failed' };
  }
}

export function isPathAllowed(pathname: string, allowedPaths: string[]): boolean {
  const normalizedPath =
    pathname.replace(
      /^\/(en|ko|ja|zh-hans|zh-hant|es|fr|de|pt-BR|pt-PT|it|ru|ar|hi|vi|th|id|tr|pl|nl|sv|da|nb|fi|cs|uk|he|el|hu|ro|bg|sk|sl|hr|lt|lv|et|ms|tl)(?=\/|$)/,
      ''
    ) || '/';

  return allowedPaths.some((allowed) => {
    if (allowed.endsWith('/*')) {
      const prefix = allowed.slice(0, -2);
      return normalizedPath.startsWith(prefix);
    }

    return normalizedPath === allowed || normalizedPath.startsWith(`${allowed}/`);
  });
}
