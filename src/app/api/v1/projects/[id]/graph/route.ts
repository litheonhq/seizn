import { NextRequest } from 'next/server';
import { handleApiV1, handleApiV1Options } from '@/lib/api-v1/middleware';
import { authorApiService, graphSubset } from '@/lib/api-v1/author';

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
    scope: 'graph',
    costUnits: 1,
    tool: 'graph',
    projectId: id,
  }, async ({ apiKey }) =>
    graphSubset(authorApiService(apiKey.userId), id, request)
  );
}
