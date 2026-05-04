import { NextRequest } from 'next/server';
import {
  readJsonBody,
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string }>
) {
  const { projectId } = await params;
  return withAuthorUiService(request, (service) => service.getSettings(projectId));
}

export async function PATCH(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string }>
) {
  const { projectId } = await params;
  return withAuthorUiService(request, async (service) =>
    service.updateSettings(projectId, await readJsonBody(request))
  );
}
