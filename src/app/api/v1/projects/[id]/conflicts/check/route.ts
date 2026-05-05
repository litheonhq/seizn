import { NextRequest } from 'next/server';
import { handleApiV1, handleApiV1Options } from '@/lib/api-v1/middleware';
import { authorApiService, checkConflicts } from '@/lib/api-v1/author';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export function OPTIONS() {
  return handleApiV1Options();
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return handleApiV1(request, {
    scope: 'check',
    costUnits: 5,
    tool: 'check',
    projectId: id,
    requiresLlmKey: true,
    idempotent: true,
  }, async ({ apiKey }) => {
    const body = await request.json().catch(() => ({}));
    return checkConflicts(authorApiService(apiKey.userId), id, body);
  });
}
