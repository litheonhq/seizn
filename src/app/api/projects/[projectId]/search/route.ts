import { NextRequest } from 'next/server';
import {
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';
const MAX_QUERY_LENGTH = 256;

export async function GET(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string }>
) {
  const { projectId } = await params;
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').slice(0, MAX_QUERY_LENGTH);
  return withAuthorUiService(request, (service) =>
    service.search(projectId, query)
  );
}
