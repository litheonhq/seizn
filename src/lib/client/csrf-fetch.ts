'use client';

const CSRF_COOKIE_NAME = 'seizn_csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export function getClientCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function csrfHeaders(base?: HeadersInit): Headers {
  const headers = new Headers(base);
  const token = getClientCsrfToken();
  if (token && !headers.has(CSRF_HEADER_NAME)) {
    headers.set(CSRF_HEADER_NAME, token);
  }
  return headers;
}

async function ensureClientCsrfToken(): Promise<void> {
  if (getClientCsrfToken()) return;
  await fetch('/api/csrf', {
    credentials: 'include',
    cache: 'no-store',
  }).catch(() => undefined);
}

export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const needsToken = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (needsToken) {
    await ensureClientCsrfToken();
  }
  return fetch(input, {
    credentials: 'include',
    ...init,
    headers: needsToken ? csrfHeaders(init.headers) : init.headers,
  });
}
