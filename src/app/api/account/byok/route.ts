import { NextRequest } from 'next/server';
import {
  AuthorUiValidationError,
  readJsonBody,
  withAuthorUiService,
} from '@/lib/author/ui';
import {
  AuthorLlmError,
  getAuthorByokStatus,
  saveAuthorByokKey,
} from '@/lib/author/llm';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, async (service, userId) => {
    const status = await getAuthorByokStatus(userId);
    return status.status === 'missing' ? service.getByok() : status;
  });
}

export async function POST(request: NextRequest) {
  return withAuthorUiService(request, async (service, userId) => {
    const body = await readJsonBody(request);
    try {
      const provider = typeof body.provider === 'string' ? body.provider : '';
      const apiKey = typeof body.api_key === 'string' ? body.api_key : '';
      const saved = await saveAuthorByokKey({ userId, provider, apiKey });
      service.saveByok(body);
      return saved;
    } catch (error) {
      if (error instanceof AuthorLlmError && error.status === 400) {
        throw new AuthorUiValidationError(error.message);
      }
      throw error;
    }
  });
}
