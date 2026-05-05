import { NextRequest } from 'next/server';
import { handleApiV1, handleApiV1Options } from '@/lib/api-v1/middleware';
import { approveCanon, authorApiService } from '@/lib/api-v1/author';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string; entityId: string }>;
};

export function OPTIONS() {
  return handleApiV1Options();
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, entityId } = await params;
  return handleApiV1(request, {
    scope: 'remember',
    costUnits: 1,
    tool: 'remember',
    projectId: id,
    idempotent: true,
  }, async ({ apiKey }) => {
    const body = await request.json().catch(() => ({}));
    return approveCanon(authorApiService(apiKey.userId), id, entityId, body);
  });
}
