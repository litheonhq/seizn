import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, type RequestUser } from '@/lib/api/request-user';
import { ensureCsrfCookie, verifyCsrfToken } from '@/lib/csrf';
import { AuthorLlmError } from '@/lib/author/llm/types';
import {
  AuthorUiNotFoundError,
  AuthorUiValidationError,
  getAuthorUiService,
  type AuthorUiService,
} from './service';

export const AUTHOR_UI_RUNTIME = 'nodejs' as const;
const MAX_JSON_BODY_BYTES = 1024 * 1024;

export interface AuthorUiRouteParams<T extends Record<string, string>> {
  params: Promise<T>;
}

export async function withAuthorUiService(
  request: NextRequest,
  handler: (service: AuthorUiService, userId: string) => Promise<unknown> | unknown
): Promise<NextResponse> {
  const user = await getRequestUser(request);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAuthorUiAccessAllowed(user)) {
    return NextResponse.json({ error: 'Author UI is not enabled for this account' }, { status: 403 });
  }
  const csrfError = verifyCsrfToken(request);
  if (csrfError) {
    return csrfError;
  }

  const service = getAuthorUiService(user.id);
  try {
    const body = await handler(service, user.id);
    await service.flushAuditWrites();
    return ensureCsrfCookie(request, NextResponse.json(body));
  } catch (error) {
    await service.flushAuditWrites();
    if (error instanceof AuthorUiValidationError) {
      return ensureCsrfCookie(request, NextResponse.json({ error: error.message }, { status: 400 }));
    }
    if (error instanceof JsonBodyTooLargeError) {
      return ensureCsrfCookie(request, NextResponse.json({ error: error.message }, { status: 413 }));
    }
    if (error instanceof AuthorUiNotFoundError) {
      return ensureCsrfCookie(request, NextResponse.json({ error: error.message }, { status: 404 }));
    }
    if (error instanceof AuthorLlmError) {
      const status = error.status ?? 500;
      return ensureCsrfCookie(
        request,
        NextResponse.json({ error: error.message, code: error.code }, { status })
      );
    }
    const message = error instanceof Error ? error.message : 'Internal error';
    const debug = process.env.VERCEL_ENV !== 'production' && error instanceof Error
      ? { stack: error.stack, name: error.name }
      : undefined;
    return ensureCsrfCookie(
      request,
      NextResponse.json({ error: message, ...(debug ? { debug } : {}) }, { status: 500 })
    );
  }
}

export class JsonBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`JSON body is too large. Maximum size is ${maxBytes} bytes.`);
    this.name = 'JsonBodyTooLargeError';
  }
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    throw new JsonBodyTooLargeError(MAX_JSON_BODY_BYTES);
  }

  try {
    const raw = await readLimitedBody(request, MAX_JSON_BODY_BYTES);
    if (!raw.trim()) return {};
    const body = JSON.parse(raw);
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch (error) {
    if (error instanceof JsonBodyTooLargeError) {
      throw error;
    }
    return {};
  }
}

async function readLimitedBody(request: NextRequest, maxBytes: number): Promise<string> {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new JsonBodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

export function isAuthorUiAccessAllowed(user: Pick<RequestUser, 'id' | 'email'>): boolean {
  const enabled = process.env.AUTHOR_UI_ENABLED;
  if (enabled === '0' || enabled === 'false') {
    return false;
  }

  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  if (enabled !== '1' && enabled !== 'true') {
    return false;
  }

  const allowedIds = envList('AUTHOR_UI_ALLOWED_USER_IDS');
  const allowedEmails = envList('AUTHOR_UI_ALLOWED_EMAILS').map((email) => email.toLowerCase());
  const email = user.email?.toLowerCase() ?? '';
  return allowedIds.includes(user.id) || (email.length > 0 && allowedEmails.includes(email));
}

function envList(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
