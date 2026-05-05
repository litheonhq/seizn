import { NextRequest } from 'next/server';
import { handleApiV1, handleApiV1Options } from '@/lib/api-v1/middleware';
import { authorApiService, timelineEntries } from '@/lib/api-v1/author';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export function OPTIONS() {
  return handleApiV1Options();
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return handleApiV1(request, {
    scope: 'timeline',
    costUnits: 5,
    tool: 'timeline',
    projectId: id,
    requiresLlmKey: true,
  }, async ({ apiKey }) =>
    timelineEntries(authorApiService(apiKey.userId), id, request)
  );
}
