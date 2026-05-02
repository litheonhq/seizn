import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
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

  try {
    const body = await handler(getAuthorUiService(user.id), user.id);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof AuthorUiValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AuthorUiNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
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
