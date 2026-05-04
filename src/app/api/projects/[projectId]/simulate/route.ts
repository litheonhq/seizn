import { NextRequest } from 'next/server';
import {
  readJsonBody,
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string }>
) {
  const { projectId } = await params;
  return withAuthorUiService(request, async (service) =>
    service.runSimulation(projectId, await readJsonBody(request))
  );
}
