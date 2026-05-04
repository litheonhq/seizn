import { NextRequest, NextResponse } from 'next/server';
import { hasApiScope, validateApiKey, type ValidateApiKeySuccess } from './api-key';

export type RequireApiScopeResult =
  | { auth: ValidateApiKeySuccess; response?: never }
  | { auth?: never; response: NextResponse };

export async function requireApiScope(
  request: NextRequest,
  requiredScope: string
): Promise<RequireApiScopeResult> {
  const auth = await validateApiKey(request);
  if (!auth.valid) {
    return {
      response: NextResponse.json(
        { error: 'Unauthorized', message: auth.error },
        { status: 401 }
      ),
    };
  }

  if (!hasApiScope(auth.scopes, requiredScope)) {
    return {
      response: NextResponse.json(
        { error: 'Forbidden', message: `Requires ${requiredScope} scope` },
        { status: 403 }
      ),
    };
  }

  return { auth };
}
