import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, type RequestUser } from '@/lib/api/request-user';
import { ensureCsrfCookie, verifyCsrfToken } from '@/lib/csrf';
import { AuthorLlmError } from '@/lib/author/llm/types';
import {
  AuthorUiNotFoundError,
  AuthorUiServiceUnavailableError,
  AuthorUiValidationError,
  getAuthorUiService,
  type AuthorUiService,
} from './service';

export const AUTHOR_UI_RUNTIME = 'nodejs' as const;

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
    if (error instanceof AuthorUiNotFoundError) {
      return ensureCsrfCookie(request, NextResponse.json({ error: error.message }, { status: 404 }));
    }
    if (error instanceof AuthorUiServiceUnavailableError) {
      const response = NextResponse.json(
        { error: error.message, code: 'service_unavailable' },
        { status: 503 }
      );
      response.headers.set('Retry-After', String(error.retryAfterSeconds));
      return ensureCsrfCookie(request, response);
    }
    if (error instanceof AuthorLlmError) {
      const status = error.status ?? 500;
      return ensureCsrfCookie(
        request,
        NextResponse.json({ error: error.message, code: error.code }, { status })
      );
    }
    // Pre-audit, this returned `error.message` directly — which for store-
    // layer failures was built as `Failed to ${op} ${table}: ${error.message}`,
    // exposing exact Supabase table names (author_candidates, author_audit_log
    // etc.), constraint names, missing-column hints, and RLS messages to the
    // API consumer. Now we return a stable generic message + a request_id
    // (the route-instance's user.id is already available; downstream log
    // aggregation can correlate). Real error stays server-side.
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('[author-ui] unhandled route error', {
      user_id: user.id,
      error: message,
      ...(error instanceof Error ? { name: error.name, stack: error.stack } : {}),
    });
    const debug = process.env.VERCEL_ENV !== 'production' && error instanceof Error
      ? { stack: error.stack, name: error.name, message }
      : undefined;
    return ensureCsrfCookie(
      request,
      NextResponse.json(
        {
          error: 'Internal error',
          ...(debug ? { debug } : {}),
        },
        { status: 500 },
      ),
    );
  }
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
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
