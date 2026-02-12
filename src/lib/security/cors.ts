import type { NextRequest } from 'next/server';

const DEFAULT_ALLOWED_ORIGINS = ['https://www.seizn.com', 'https://seizn.com'];

function normalizeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(): Set<string> {
  const configured = process.env.CORS_ALLOWED_ORIGINS
    ?.split(',')
    .map((value) => normalizeOrigin(value.trim()))
    .filter(Boolean) as string[] | undefined;

  const dynamic = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
  ]
    .filter(Boolean)
    .map((value) => normalizeOrigin(value as string))
    .filter(Boolean) as string[];

  return new Set([...(configured ?? []), ...dynamic, ...DEFAULT_ALLOWED_ORIGINS]);
}

export function buildCorsPreflightHeaders(
  request: NextRequest,
  methods: string,
  allowedHeaders: string,
  maxAge = '86400'
): Record<string, string> | null {
  const origin = request.headers.get('origin');
  if (!origin) {
    return null;
  }

  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.has(origin)) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': allowedHeaders,
    'Access-Control-Max-Age': maxAge,
    Vary: 'Origin',
  };
}
