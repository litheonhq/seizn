import { NextRequest } from 'next/server';
import {
  readJsonBody,
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string; conflictId: string }>
) {
  const { projectId, conflictId } = await params;
  return withAuthorUiService(request, async (service) =>
    service.resolveConflict(projectId, conflictId, await readJsonBody(request))
  );
}
