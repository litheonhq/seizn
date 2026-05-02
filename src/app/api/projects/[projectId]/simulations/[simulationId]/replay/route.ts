import { NextRequest } from 'next/server';
import {
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string; simulationId: string }>
) {
  const { projectId, simulationId } = await params;
  return withAuthorUiService(request, (service) => service.replaySimulation(projectId, simulationId));
}
