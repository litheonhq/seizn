import { NextRequest } from 'next/server';
import { handleApiV1, handleApiV1Options } from '@/lib/api-v1/middleware';
import { authorApiService, listMentions } from '@/lib/api-v1/author';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string; entityId: string }>;
};

export function OPTIONS() {
  return handleApiV1Options();
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id, entityId } = await params;
  return handleApiV1(request, {
    scope: 'recall',
    costUnits: 1,
    tool: 'recall',
    projectId: id,
  }, async ({ apiKey }) =>
    listMentions(authorApiService(apiKey.userId), id, entityId, request)
  );
}
