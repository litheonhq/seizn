import { NextRequest } from 'next/server';
import { handleApiV1, handleApiV1Options } from '@/lib/api-v1/middleware';
import { usageSummary } from '@/lib/api-v1/author';

export const runtime = 'nodejs';

export function OPTIONS() {
  return handleApiV1Options();
}

export async function GET(request: NextRequest) {
  return handleApiV1(request, {
    scope: 'usage',
    costUnits: 0,
    tool: 'projects',
  }, async ({ apiKey }) => usageSummary(apiKey));
}
