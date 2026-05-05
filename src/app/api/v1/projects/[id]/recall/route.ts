import { NextRequest } from 'next/server';
import { handleApiV1, handleApiV1Options } from '@/lib/api-v1/middleware';
import { authorApiService, recallEntities } from '@/lib/api-v1/author';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export function OPTIONS() {
  return handleApiV1Options();
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  return handleApiV1(request, {
    scope: 'recall',
    costUnits: 1,
    tool: 'recall',
    projectId: id,
  }, async ({ apiKey }) =>
    recallEntities(authorApiService(apiKey.userId), id, searchParams.get('q') ?? '')
  );
}
