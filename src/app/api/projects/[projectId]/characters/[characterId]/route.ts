import { NextRequest } from 'next/server';
import {
  readJsonBody,
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string; characterId: string }>
) {
  const { projectId, characterId } = await params;
  return withAuthorUiService(request, (service) => service.getCharacter(projectId, characterId));
}

export async function PATCH(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string; characterId: string }>
) {
  const { projectId, characterId } = await params;
  return withAuthorUiService(request, async (service) =>
    service.updateCharacter(projectId, characterId, await readJsonBody(request))
  );
}
