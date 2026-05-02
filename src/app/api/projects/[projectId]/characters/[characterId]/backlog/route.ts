import { NextRequest } from 'next/server';
import {
  readJsonBody,
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string; characterId: string }>
) {
  const { projectId, characterId } = await params;
  return withAuthorUiService(request, async (service) =>
    service.generateCharacterBacklog(projectId, characterId, await readJsonBody(request))
  );
}
