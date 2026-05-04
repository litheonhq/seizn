import { NextRequest } from 'next/server';
import {
  readJsonBody,
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string; candidateId: string }>
) {
  const { projectId, candidateId } = await params;
  return withAuthorUiService(request, async (service) =>
    service.decideCandidate(projectId, candidateId, await readJsonBody(request))
  );
}
