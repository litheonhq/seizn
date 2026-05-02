import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, type RequestUser } from '@/lib/api/request-user';
import { ensureCsrfCookie, verifyCsrfToken } from '@/lib/csrf';
import {
  AuthorUiNotFoundError,
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
    throw error;
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
