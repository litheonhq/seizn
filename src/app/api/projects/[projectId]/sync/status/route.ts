import { NextRequest } from 'next/server';
import {
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string }>
) {
  const { projectId } = await params;
  return withAuthorUiService(request, (service) => service.getSyncStatus(projectId));
}
